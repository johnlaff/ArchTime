# Plan 013 (spike): Desenhar a feature de faturamento — horas × hourlyRate por projeto/mês

> **Executor instructions**: Este é um plano de SPIKE/DESIGN — o entregável é um
> documento de design, NÃO código de produção. Follow this plan step by step.
> If anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- prisma/schema.prisma src/lib/server/ src/app/projetos/ src/types/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M (grosseiro — spikes têm estimativa imprecisa por natureza)
- **Risk**: LOW (nenhum código de produção muda)
- **Depends on**: plans/006-projects-audit-log-decimal.md (contrato numérico de hourlyRate na API)
- **Category**: direction
- **Planned at**: commit `e52a5ad`, 2026-07-03

## Why this matters

ArchTime é, por descrição do próprio produto, "time tracking para freelancers e profissionais independentes" — e a assimetria mais clara do código é que o insumo de faturamento existe de ponta a ponta (coluna `Project.hourlyRate Decimal?` no schema, formulário de criação/edição, exibição "R$ X/h" no card do projeto) mas **nenhum lugar multiplica horas por taxa**: o app nunca responde "quanto ganhei este mês / por projeto", o número que um freelancer mais quer do seu rastreador de horas. Este spike investiga e especifica a feature; a implementação vem em plano futuro, depois que o design for aprovado pelo mantenedor.

## Current state

O que já existe (dados verificados no commit e52a5ad):

- `prisma/schema.prisma:54` — `hourlyRate Decimal? @map("hourly_rate") @db.Decimal(10, 2)` em `Project`.
- `src/app/projetos/projetos-client.tsx` — form captura `hourlyRate` (linhas 26, 101–102, 122) e exibe "R$ X/h" no card. Único uso de exibição hoje.
- `TimeAllocation.minutes` (schema) — minutos alocados por projeto por sessão; uma Sessão tem no máximo uma alocação (ver `CONTEXT.md`, termo "Projeto").
- Agregações existentes para reutilizar como padrão:
  - `src/lib/server/sidebar-data.ts` — `fetchActiveProjects` já calcula `monthMinutes` por projeto (é a fonte do widget "Distribuição por Projeto" em `src/components/activity-panel-content.tsx:67-95`).
  - `src/lib/hour-bank.ts` — `buildPeriodBalanceFromEntries` (soma de minutos por período via `splitIntervalByLocalDay`).
- Vocabulário de `CONTEXT.md` a honrar: **Sessão**, **Segmento**, **Projeto** ("o trabalho faturável a que uma Sessão é alocada"), **Insight** ("leitura derivada e somente-visual... nunca é fonte de verdade").
- Convenção de docs de design: `docs/plans/2026-02-23-*.md` (ex.: `2026-02-23-features-design.md`) — o entregável deste spike segue esse formato/local.
- Regra de arquitetura (AGENTS.md): agregações com joins/lógica sensível vão em API route com Prisma (não client-direct).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Nenhum build/test é exigido | — | o entregável é um .md |
| (Opcional) explorar dados | `npx prisma studio` | somente leitura; NÃO altere linhas |

## Scope

**In scope** (the only files you should modify):
- `docs/plans/<data-de-hoje>-faturamento-design.md` (criar — o entregável)
- `plans/README.md` (status)

**Out of scope** (do NOT touch, even though they look related):
- QUALQUER código de produção, schema ou migration — este plano não implementa nada.
- Criar o plano de implementação — isso é decisão do mantenedor após ler o design.

## Git workflow

- Branch: `advisor/013-spike-faturamento`
- Commit: `docs(design): spike de faturamento (horas × hourlyRate)`
- Não faça push nem abra PR sem instrução explícita do operador.

## Steps

### Step 1: Investigar a base de dados do design

Leia (todos): `prisma/schema.prisma` (Project/TimeAllocation/ClockEntry), `src/lib/server/sidebar-data.ts` (o cálculo de `monthMinutes`), `src/lib/hour-bank.ts` (padrão de período), `src/components/activity-panel-content.tsx` (widget Distribuição — candidato natural a exibir R$), `src/app/api/hour-bank/route.ts` e `src/app/historico/historico-client.tsx` (rodapé de totais do mês — outro candidato).

**Verify**: você consegue afirmar, com file:line, onde os minutos por projeto/mês já são calculados hoje.

### Step 2: Escrever o documento de design

Crie `docs/plans/<hoje>-faturamento-design.md` com EXATAMENTE estas seções:

1. **Objetivo** — a pergunta que a feature responde ("quanto ganhei em <período>, total e por projeto").
2. **Fatos do modelo atual** — o que o Step 1 apurou, com file:line. Inclua as lacunas honestas: sessões sem projeto não faturam; projetos com `hourlyRate` null não faturam; alocação é 1:1 com a sessão.
3. **Questão central de produto: taxa retroativa** — `hourlyRate` vive no Projeto; editar a taxa muda o faturamento HISTÓRICO recalculado. Apresente as duas opções com trade-offs: (a) aceitar recálculo retroativo (simples, coerente com hour_bank que também recalcula tudo; a auditoria do plano 006 registra as mudanças de taxa) vs. (b) snapshot da taxa por sessão/alocação (correto para fatura emitida, exige coluna nova + backfill). Recomende (a) para v1, com o argumento de que o app não emite faturas — informa.
4. **Regra de cálculo proposta** — minutos alocados no período × `hourlyRate` / 60; arredondamento a centavos por projeto e soma dos arredondados (determinístico); formato `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`; sessões multi-dia entram pelo mesmo split de segmentos usado nos totais (consistência com o Histórico).
5. **Superfícies candidatas (v1 mínima)** — recomende UMA: acrescentar o valor R$ ao widget "Distribuição por Projeto" (`activity-panel-content.tsx:67-95`) + total do mês no rodapé do Histórico. Liste as alternativas descartadas (página nova de relatórios; card no dashboard) e por quê.
6. **Forma da API** — recomendação: estender o payload de `/api/activity/overview` (distribution já tem `monthMinutes` por projeto — acrescentar `monthEarnings` ali e `hourlyRate` nulo-safe) em vez de rota nova; cite a regra do AGENTS.md sobre agregações server-side.
7. **Privacidade/UX** — o valor é sensível em tela compartilhada: propor toggle nas Configurações ("mostrar valores"), default OFF, persistido em `UserSettings` (padrão: campos existentes como `showCumulativeBalance`).
8. **Questões abertas para o mantenedor** — no mínimo: retroatividade (aceita a recomendação?); onde exibir primeiro; moeda única BRL é suficiente?; sessões sem projeto devem aparecer como "não faturado"?
9. **Estimativa de implementação** — grosseira, por superfície (S/M), citando os arquivos que mudariam.

**Verify**: o documento existe, todas as 9 seções presentes, toda afirmação sobre o código tem file:line.

### Step 3: Encerrar

Atualize `plans/README.md` (status DONE com link para o design doc) e reporte ao operador o resumo + as questões abertas da seção 8.

**Verify**: linha atualizada; questões listadas no relatório final.

## Test plan

Não se aplica (entregável é documento). O "teste" é a checagem de completude do Step 2.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `docs/plans/*faturamento-design.md` existe com as 9 seções (grep pelos títulos)
- [ ] Nenhum arquivo fora do in-scope modificado (`git status`)
- [ ] Questões abertas reportadas ao operador
- [ ] Linha do plano 013 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- Você se ver escrevendo código de produção ou migration — o spike terminou onde a implementação começa.
- Descobrir no Step 1 que `hourlyRate` foi removido/renomeado ou que alocações viraram N:N (drift estrutural) — o design inteiro muda; reporte.

## Maintenance notes

- O plano de implementação futuro deve nascer da seção 9 do design doc, depois do OK do mantenedor nas questões da seção 8.
- Alternativa de direção registrada na auditoria e NÃO selecionada agora: insights por `activityType` (espelhar `topProjectOf` para atividade) — se o mantenedor quiser ambas, compartilham a mesma superfície de Insights.
