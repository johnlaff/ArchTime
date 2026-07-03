# Faturamento (Spike): horas × hourlyRate por projeto/mês

**Data:** 2026-07-03
**Status:** Spike — aguardando aprovação do mantenedor (nenhum código de produção incluso)
**Plano:** 013 (spike) — depende de 006 (DONE)

---

## 1. Objetivo

ArchTime é "time tracking para freelancers e profissionais independentes". O app já pede uma taxa
por hora ao criar um Projeto e a exibe no card ("R$ X/h"), mas nunca responde à pergunta óbvia que
essa taxa existe para responder:

> **"Quanto eu ganhei — este mês, e em cada projeto?"**

Este documento especifica o que seria necessário para o app calcular e exibir esse valor, sem
implementar nada. A pergunta secundária que a feature também deveria responder ("quanto eu ganhei
no total, incluindo sessões sem projeto associado?") é respondida como "não faturado" — ver seção 2.

---

## 2. Fatos do modelo atual

Tudo abaixo é o estado real do código no momento do spike (branch `advisor/013-spike-faturamento`,
base = main pós-plano 011).

**O insumo existe de ponta a ponta, mas isolado:**
- `prisma/schema.prisma:54` — `Project.hourlyRate Decimal? @db.Decimal(10, 2)`, opcional (nullable).
- `src/app/projetos/projetos-client.tsx:26,30,90,101-107,122,133` — formulário de criação/edição
  captura `hourlyRate` como string, valida `>= 0` no client.
- `src/app/projetos/projetos-client.tsx:245-248` — único lugar que **exibe** a taxa hoje: badge
  `R$ {Number(project.hourlyRate).toFixed(2)}/h` no card do projeto, condicionado a
  `project.hourlyRate` truthy (então `0` não mostra badge — comportamento pré-existente, fora de
  escopo deste spike).
- `src/lib/server/serialize-project.ts:1-18` — contrato numérico do 006: `hourlyRate` sai do
  Prisma como `Decimal`/`unknown` e é convertido para `number | null` aqui, uma vez, antes de
  chegar ao client. Qualquer código de faturamento deve reusar esse serializer, não reimplementar
  a conversão.
- `src/app/api/projects/route.ts:38-46` (POST) e `:106-108,123` (PUT) — `normalizeHourlyRate`
  (`src/lib/server/validation.ts:48-53`) valida `>= 0` e permite `null`/vazio no servidor também.

**Onde minutos por projeto/mês já são calculados hoje** (a pergunta do Step 1 do plano):
- `src/lib/server/sidebar-data.ts:23-53` (`fetchActiveProjects`) — **fonte da verdade atual**. SQL
  raw: `SELECT p.id, p.name, p.color, COALESCE(SUM(...ta.minutes...), 0) AS month_minutes FROM
  projects p LEFT JOIN time_allocations ta ... LEFT JOIN clock_entries ce ...  WHERE p.user_id = $1
  AND p.is_active = true GROUP BY ... ORDER BY month_minutes DESC LIMIT 4`. Note o `FROM projects
  p`: a consulta parte da tabela de projetos, então **minutos sem alocação a nenhum projeto nunca
  entram nesse resultado** — não há linha "sem projeto" nele, nem hoje nem em qualquer versão
  ingênua que reuse essa query para faturamento.
- `src/app/api/activity/overview/route.ts:22-27,41-46` — chama `fetchActiveProjects` e devolve
  `distribution: DistributionItem[]` (`src/types/index.ts:117-122`: `{ id, name, color,
  monthMinutes }`) dentro de `ActivityOverview` (`src/types/index.ts:124-129`).
- `src/components/activity-panel-content.tsx:68-96` — widget "Distribuição por Projeto" consome
  `distribution`, calcula `pct` client-side e renderiza barras. Candidato natural a ganhar uma
  coluna de R$ (ver seção 5).
- `src/lib/history.ts:16-93` (`buildHistoryData`) — caminho **diferente e independente** de
  agregação: busca `ClockEntry` com `include: { allocations: { take: 1 } }` (linha 34-37, já
  assumindo no máximo 1 alocação relevante por sessão), quebra em segmentos por dia
  (`splitIntervalByLocalDay`), e cada segmento carrega `projectId: entry.allocations[0]?.projectId
  ?? null` (linha 59). `totalMinutes` (linha 75) e `sessionCount` (linha 83) são somas em memória
  sobre os segmentos **visíveis** (após filtro), não uma query SQL agregada.
- `src/app/historico/historico-client.tsx:618-626` — rodapé "Total do mês" / "Total filtrado"
  renderiza `data.totalMinutes` e `data.sessionCount`. Candidato a exibir R$ do período filtrado.
- `src/lib/hour-bank.ts:74-94` (`buildPeriodBalanceFromEntries`) — padrão de agregação por período
  (mês/semana) que soma minutos reais vs. esperados; não tem noção de projeto nem de dinheiro, mas
  é o padrão de "período com start/end BRT" a seguir (`src/app/api/hour-bank/route.ts:1-18` expõe
  isso via `buildHourBankMonth`).

**Lacunas honestas do modelo atual, relevantes para qualquer design de faturamento:**
1. **Sessões sem projeto não faturam.** `TimeAllocation` é opcional por sessão — uma `ClockEntry`
   sem `allocations` não aparece em `fetchActiveProjects` (parte de `projects`, não de
   `clock_entries`) nem teria como ser atribuída a uma taxa. Qualquer "total faturável do mês"
   precisa decidir explicitamente se soma só o alocado ou expõe "não faturado" como categoria
   própria (recomendado — ver seção 8).
2. **`hourlyRate` nulo não fatura.** Projeto sem taxa configurada não tem como gerar R$; o app
   precisa tratar isso como "sem taxa" (não como R$ 0) para não mentir "trabalhou de graça".
3. **Alocação é 1:1 hoje.** `CONTEXT.md:21-22` — "**Projeto** — o trabalho faturável a que uma
   Sessão é alocada, via TimeAllocation. Uma Sessão hoje tem no máximo uma alocação (um projeto)."
   O schema (`prisma/schema.prisma:94-107`) não impede N alocações por `ClockEntry`
   estruturalmente, mas o código de leitura assume 1 (`take: 1` em `src/lib/history.ts:36`) e o
   vocabulário do domínio trata isso como regra de produto atual, não só limitação técnica. Um
   design de faturamento não deve introduzir alocação N:N — isso é fora de escopo (STOP condition
   do plano 013).
4. **`Insight` é somente-visual.** `CONTEXT.md:27-29` — "Insight nunca é fonte de verdade — sempre
   derivado das Sessões." Um valor de faturamento exibido em Distribuição/Histórico é,
   semanticamente, mais um Insight derivado (recalculável, não persistido como fato) — o que
   simplifica a decisão da seção 3.

---

## 3. Questão central de produto: taxa retroativa

`hourlyRate` vive no **Projeto** (`prisma/schema.prisma:54`), não na Sessão nem na
`TimeAllocation`. Isso significa: **editar a taxa de um projeto muda o faturamento de TODO o
histórico já trabalhado**, recalculado a qualquer momento que a UI leia `hourlyRate` atual ×
minutos históricos.

Duas opções:

**(a) Aceitar recálculo retroativo.** O faturamento exibido é sempre `minutos históricos ×
hourlyRate atual`. Se o usuário reajusta a taxa em julho, o "ganho de março" exibido hoje muda
para refletir a taxa nova — não é uma fatura histórica, é uma leitura corrente do trabalho
passado à luz da taxa presente.
- Prós: zero mudança de schema, coerente com o padrão já usado por `hour_bank`
  (`src/lib/hour-bank.ts` recalcula saldo a partir de `ClockEntry` sempre que chamado, nunca
  "congela" o passado), coerente com `Insight` ser sempre derivado (`CONTEXT.md:27-29`), e a
  auditoria de mudanças de taxa já existe: `src/app/api/projects/route.ts:129-138` grava
  `oldData`/`newData` (incluindo `hourlyRate`) em `AuditLog` a cada `PUT` — então, embora a UI não
  mostre "quanto era antes", o dado de auditoria permite reconstruir a mudança se necessário.
- Contras: se o usuário está usando o número para cobrar um cliente, um reajuste de taxa "reescreve"
  silenciosamente o valor já cobrado em meses passados — pode surpreender.

**(b) Snapshot da taxa por sessão/alocação.** Cada `TimeAllocation` (ou `ClockEntry`) grava a
`hourlyRate` vigente no momento da alocação. Faturamento passado fica imutável a reajustes futuros.
- Prós: correto para quem realmente emite fatura/cobra do cliente com base nesse número.
- Contras: exige coluna nova (`TimeAllocation.hourlyRateSnapshot` ou similar) + migration +
  backfill de dados históricos (que taxa usar para alocações já existentes? a atual do projeto é a
  única informação disponível — o backfill seria, na prática, idêntico à opção (a) para todo
  histórico anterior à migration) + lógica de "qual taxa vale" em cada leitura.

**Recomendação para v1: opção (a).** O app *informa*, não emite fatura fiscal/contratual. Um
recálculo retroativo simples é honesto sobre o que o número representa ("estimativa com a taxa
atual"), evita migration, e é consistente com todo o resto do produto (`hour_bank`, `Insight`). Se
o produto evoluir para emissão de fatura formal, (b) vira necessário — mas isso é uma feature
distinta, não uma variação de v1.

---

## 4. Regra de cálculo proposta

```
earningsCents(projeto, período) = round_to_cents(
  Σ (minutos_alocados_ao_projeto_no_período × hourlyRate_atual_do_projeto / 60)
)
```

Detalhes:
- **Minutos de entrada**: os mesmos minutos já usados para os totais existentes — segmentos por
  dia local BRT (`splitIntervalByLocalDay`, usado tanto em `src/lib/history.ts:43` quanto
  implicitamente pela agregação SQL de `src/lib/server/sidebar-data.ts`). Uma sessão que cruza a
  meia-noite já é dividida em 2 segmentos para os totais de horas — o valor em R$ deve seguir o
  mesmo split, não recalcular sobre a sessão inteira (evitaria inconsistência entre "horas do dia"
  e "R$ do dia" caso o Histórico algum dia exiba R$ por dia).
- **Arredondamento**: a centavos, **por projeto**, e depois somar os já arredondados — não somar
  frações e arredondar só o total (evita a aparência de erro de "1 centavo" quando o usuário soma
  os itens da UI manualmente). Ex.: projeto A = R$ 12,345 → R$ 12,35 exibido; projeto B = R$
  8,004 → R$ 8,00; total exibido = R$ 20,35 (soma dos arredondados), não `round(12,345 + 8,004) =
  R$ 20,35` coincidentemente igual aqui, mas o método importa em casos de borda.
- **Formatação**: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` —
  mesma abordagem que o resto do app usa para números localizados (`formatMinutes`,
  `formatBRT` em `src/lib/dates.ts`), sem introduzir uma lib de dinheiro nova para v1.
- **`hourlyRate` nulo**: projeto não entra na soma monetária; a UI marca "sem taxa configurada"
  em vez de omitir silenciosamente (evita o usuário achar que o projeto não trabalhou).
- **Minutos sem projeto**: somados separadamente como "não faturado", nunca silenciosamente
  descartados do total de horas (que já existe e não deve mudar) nem incluídos na soma de R$.

---

## 5. Superfícies candidatas (v1 mínima)

**Recomendação: UMA superfície combinada.**
1. Coluna/valor de R$ no widget **"Distribuição por Projeto"**
   (`src/components/activity-panel-content.tsx:68-96`) — já lista projeto + minutos do mês; um R$
   ao lado do `{pct}%` é a extensão mais barata e mais visível (aparece no dashboard, não requer
   navegação).
2. **Total do mês** no rodapé do **Histórico**
   (`src/app/historico/historico-client.tsx:618-626`) — já mostra `totalMinutes` +
   `sessionCount` filtrados; adicionar "≈ R$ X" ao lado é natural e já respeita os filtros
   ativos (projeto, data, busca) que o usuário aplicou.

Ambas leem dados que **já existem** nas rotas que já existem (`/api/activity/overview` e
`/api/history`), então v1 é "acrescentar campo", não "nova tela".

**Alternativas descartadas:**
- **Nova página/rota `/faturamento`** — descartada para v1: exigiria navegação nova, decisão de
  IA (mês vs. ano vs. por cliente), e o produto não tem hoje o conceito de "fatura" nem
  "cliente" como entidade separada de `Project.clientName` (string livre). Overkill para
  responder "quanto ganhei este mês".
- **Badge de R$ no card do projeto** (`projetos-client.tsx`) — já existe a taxa "R$ X/h"
  (`:245-248`); adicionar "ganhou R$ Y este mês" ali seria útil mas essa tela é sobre *cadastro*
  de projetos, não sobre *atividade* — o usuário não vai lá para acompanhar quanto ganhou.
  Descartado como superfície primária; poderia ser um "nice to have" posterior.
- **Notificação/resumo mensal (email, push)** — fora de escopo: o app não tem infraestrutura de
  notificação hoje.
- **Exportação de fatura/PDF** — é uma feature de "emitir cobrança", não de "informar quanto
  ganhei"; depende da decisão da seção 3 (snapshot de taxa) para ser correta. Fora de v1.

---

## 6. Forma da API

**Recomendação: estender `/api/activity/overview` em vez de criar rota nova.**

`GET /api/activity/overview` (`src/app/api/activity/overview/route.ts:22-47`) já retorna
`distribution: DistributionItem[]` com `monthMinutes` por projeto, alimentado por
`fetchActiveProjects` (`src/lib/server/sidebar-data.ts:23-53`). A extensão proposta:

```ts
// src/lib/server/sidebar-data.ts — fetchActiveProjects
export interface ActiveProject {
  id: string
  name: string
  color: string
  monthMinutes: number
  hourlyRate: number | null   // novo — via serializeProject/normalizeHourlyRate, nulo-safe
}

// src/types/index.ts — DistributionItem
export interface DistributionItem {
  id: string
  name: string
  color: string
  monthMinutes: number
  hourlyRate: number | null   // novo
  monthEarningsCents: number | null  // novo — null quando hourlyRate é null
}
```

O cálculo de `monthEarningsCents` pode ser feito na própria query SQL de
`fetchActiveProjects` (Postgres já tem `p.hourly_rate` disponível no `SELECT`, é só multiplicar e
arredondar ali) ou no map de `src/app/api/activity/overview/route.ts:41-46` — a query SQL é
preferível por manter a agregação (SUM + GROUP BY) e o cálculo monetário no mesmo lugar, seguindo
`AGENTS.md:64`: "Agregações, joins e lógica sensível devem usar API Route com Prisma" — isso já é
uma API Route com Prisma (`prisma.$queryRaw`), então o cálculo de R$ deve viver ali também, não
ser recalculado no client component (`activity-panel-content.tsx`) a partir de minutos + taxa —
isso duplicaria a regra de arredondamento em dois lugares.

O total do Histórico (`buildHistoryData`, `src/lib/history.ts:75-83`) pode somar
`segmentMinutes × hourlyRate/60` por segmento **no servidor**, já que o projeto de cada segmento
já é resolvido (`entry.allocations[0]?.project`, linha 35/57) — só precisa incluir `hourlyRate` no
`select` do `project` (linha 35: hoje só seleciona `name, color`) e devolver `totalEarningsCents`
em `HistoryData` (`src/types/index.ts:67-74`), calculado sobre os segmentos **visíveis** (após
filtro), igual a `totalMinutes` hoje.

**Não recomendado:** rota nova (`/api/faturamento`) — duplicaria a query de `fetchActiveProjects` e
quebraria o cache (`cacheTag('sidebar-${userId}')`, `sidebar-data.ts:26`) que já invalida
corretamente quando o usuário bate ponto.

---

## 7. Privacidade/UX

Faturamento é informação sensível (renda) de um jeito que "horas trabalhadas" não é — alguém
compartilhando a tela, ou olhando por cima do ombro, pode não querer expor quanto ganha por hora
ou por mês.

Recomendação: toggle **"Mostrar valores"** em Configurações, seguindo exatamente o padrão de
`showCumulativeBalance` já existente:
- `prisma/schema.prisma:32` — `showCumulativeBalance Boolean @default(false)` seria espelhado por
  algo como `showEarnings Boolean @default(false) @map("show_earnings")` em `UserSettings`
  (`prisma/schema.prisma:27-47`).
- `src/lib/user-settings.ts:30-42` (`SerializedUserSettings`) e `:148-224`
  (`parseSettingsPatch`) seguem o padrão exato de validação booleana já usado para
  `showCumulativeBalance` (`:166-169`).
- `src/app/configuracoes/configuracoes-client.tsx:274-287` — mesmo padrão de `<label><input
  type="checkbox" checked={settings.showCumulativeBalance} .../> Mostrar saldo acumulado</label>`,
  trocando o texto para "Mostrar valores em R$".
- **Default OFF** — mesma escolha de `showCumulativeBalance` (`@default(false)`): o usuário opta
  por ver dinheiro, não é bombardeado com ele por padrão. Isso também evita expor R$ para quem
  nunca configurou `hourlyRate` em nenhum projeto (toggle OFF por padrão = nada muda para esse
  usuário).
- Quando OFF, a API ainda pode devolver os campos (são baratos de calcular e o valor não é
  secreto do servidor, só da UI) — a ocultação é de renderização, igual ao padrão atual onde
  `cumulativeBalance` já vem `null` da API quando a config está desligada
  (`src/lib/hour-bank.ts:202-203`: `let cumulativeBalance: number | null = null; if
  (settings.showCumulativeBalance) { ... }`). Seguir o mesmo: se `showEarnings` for false, a API
  devolve `monthEarningsCents: null` / `totalEarningsCents: null` em vez de omitir o campo,
  mantendo o contrato de tipos estável.

---

## 8. Questões abertas para o mantenedor

1. **Retroatividade** (seção 3): aceitar recálculo com a taxa atual (opção a) ou já planejar
   snapshot por alocação (opção b) para não ter que migrar depois? A resposta muda se o mantenedor
   já sabe que "emitir fatura formal" é uma meta próxima.
2. **Onde exibir primeiro**: só Distribuição, só Histórico, ou as duas de uma vez (seção 5)? Fazer
   as duas é pouco esforço incremental já que a mesma extensão de API cobre ambas.
3. **BRL único?** Hoje não há campo de moeda no schema — `hourlyRate` é assumido em R$
   implicitamente pela formatação hardcoded "R$ X/h" (`projetos-client.tsx:247`). Vale a pena
   perguntar se o produto algum dia precisa de multi-moeda (freelancer com cliente
   internacional) antes de espalhar `Intl.NumberFormat('pt-BR', ..., currency: 'BRL')` em mais
   lugares — trocar depois seria um refactor maior.
4. **Sessões sem projeto**: tratar como "não faturado" (soma separada, visível) ou ignorar
   silenciosamente na UI de faturamento? Recomendação implícita da seção 4 é mostrar, mas o
   mantenedor pode preferir simplicidade de v1 e só assumir "os minutos que não batem com o
   total de horas são não-faturados", sem UI dedicada.
5. **Taxa zero (`hourlyRate = 0`) é "trabalho voluntário/pro bono" ou "taxa não preenchida"?** Hoje
   o card oculta o badge quando `hourlyRate` é `0` (`projetos-client.tsx:245`, checagem truthy) —
   o mesmo bug/ambiguidade se propagaria para faturamento se não for tratado explicitamente
   (`0` é um valor válido de taxa, diferente de `null`).
6. **Threshold de "vale a pena mostrar"**: projetos com poucos minutos no mês (ex.: 5 min)
   gerariam um valor tipo "R$ 0,08" — isso é ruído ou informação real? Não é bloqueante, mas afeta
   a legibilidade do widget de Distribuição.

---

## 9. Estimativa de implementação (grosseira, por superfície)

| Superfície | Esforço | Arquivos principais |
|---|---|---|
| Toggle de privacidade (Configurações) | **S** | `prisma/schema.prisma` (migration `show_earnings`), `src/lib/user-settings.ts` (serialize + parseSettingsPatch + updateUserSettings), `src/app/configuracoes/configuracoes-client.tsx` (checkbox) |
| API — Distribuição por Projeto (`monthEarningsCents`) | **S** | `src/lib/server/sidebar-data.ts` (`fetchActiveProjects` — SQL + interface), `src/types/index.ts` (`DistributionItem`), `src/app/api/activity/overview/route.ts` (map) |
| UI — widget Distribuição exibe R$ | **S** | `src/components/activity-panel-content.tsx` (`Distribution`, linhas 68-96) |
| API — total do Histórico (`totalEarningsCents`) | **M** | `src/lib/history.ts` (`buildHistoryData` — incluir `hourlyRate` no select do project, calcular por segmento, respeitar filtro), `src/types/index.ts` (`HistoryData`) |
| UI — rodapé do Histórico exibe R$ | **S** | `src/app/historico/historico-client.tsx` (linhas 618-626) |
| Testes (unit + rota) | **M** | espelhar os testes já existentes de `sidebar-data`/`history`/`user-settings` (arredondamento por projeto, nulo-safety de `hourlyRate`, toggle OFF por padrão) |

**Total estimado: M** (nenhum item individual é grande; a soma + testes de arredondamento monetário
é o que empurra de S para M). Nenhuma migration além da coluna booleana de `UserSettings` — sem
mudança em `Project`, `TimeAllocation` ou `ClockEntry` (confirma que a opção (a) da seção 3 não
tem custo de schema).
