# Implementation Plans

## Rodada 1 (2026-07-03, commit `e52a5ad`)

Gerados pelo skill improve em 2026-07-03, a partir de auditoria `standard`. Execute na ordem
abaixo salvo indicação contrária das dependências. Cada executor: leia o plano inteiro antes de
começar, honre as STOP conditions e atualize sua linha ao terminar.

## Rodada 2 (2026-07-09, commit `744da2b`)

Gerados pelo skill improve em 2026-07-09, a partir de auditoria `standard` no commit `744da2b`,
com 4 subagentes Explore por categoria + vetting manual. Os 11 planos (014–024) cobrem 23
achados agrupados por tema sem conflito de arquivos. Achados por categoria: corretude/async (#4,
#5), segurança (#2, #3, #7), tech-debt/dead-code (#8–#12), DX/docs/deps (#6, #13–#16),
performance (#21–#23), testes (#17–#20). O subagente de segurança voltou vazio na 1ª rodada e
foi re-despachado; os achados de RLS (#2, #3) e Host (#7) vieram da 2ª.

> Nota: `docs/plans/` é um diretório histórico de planejamento de features, sem relação com este.
> Os planos de execução do advisor vivem aqui em `plans/`.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | CI no GitHub Actions (tsc + testes + build em PR) | P1 | S | — | DONE |
| 002 | /api/sync invalida cache tags do dashboard | P1 | S | — | DONE |
| 003 | RLS: travar INSERT/UPDATE client-direct | P1 | M | 001 (recomendado) | DONE (migration 0006 aplicada em produção em 2026-07-03; pg_policies confirma só SELECT nas 4 tabelas) |
| 004 | Testes das rotas de clock + fila offline | P1 | M | — | DONE |
| 005 | Guard no recálculo do hour_bank pós-commit | P2 | M | 004 | DONE |
| 006 | AuditLog em projects + hourlyRate numérico | P2 | S | — | DONE |
| 007 | Teste de paridade do script anti-flash | P2 | S | — | DONE |
| 009 | Headers de hardening (CSP report-only) | P2 | M | — | DONE (sweep autenticado pendente antes de promover CSP a enforce) |
| 008 | Verificação do hash de integridade (/api/integrity) | P3 | M | 003 (recomendado) | DONE |
| 010 | Rodapé do Histórico: "registros", não "sessões" | P3 | S | — | DONE |
| 011 | Higiene: README real, SVGs órfãos, Node 22 | P3 | S | 001 | DONE |
| 012 | Guard de resposta obsoleta no useSupabaseQuery | P3 | S | — | DONE |
| 013 | Spike de design: faturamento (horas × hourlyRate) | P3 | M | 006 | DONE (design em docs/plans/2026-07-03-faturamento-design.md; 6 questões abertas aguardando o mantenedor) |
| 014 | Sincronizar schema Prisma + completar lockdown RLS (migration 0007) | P1 | S | — | DONE (migration 0007 criada; APLICAÇÃO em produção pendente do operador — ver STOP condition) |
| 015 | Tratar falha do IndexedDB no clock-in offline | P1 | S | — | TODO |
| 016 | Guarda condicional no UPDATE de clock-out (race) | P2 | M | — | TODO |
| 017 | Remover código morto e duplicado (sweep de hygiene) | P3 | S | — | TODO |
| 018 | Corrigir env var fantasma e docs de setup/segurança | P3 | S | 014 (recomendado) | TODO |
| 019 | Gate de react-doctor no CI | P2 | S | — | TODO |
| 020 | Adicionar linter (Biome) e remover `eslint-disable` mortos | P3 | M | — | TODO |
| 021 | Endurecer `validateMutationOrigin` contra spoofing de Host | P3 | S | — | TODO |
| 022 | Reduzir round-trips no recálculo do hour-bank e no dashboard | P3 | M | 016 (recomendado) | TODO |
| 023 | Testes para boundaries de segurança (DELETE projects + isAllowedEmail) | P1 | S | — | TODO |
| 024 | Testes para pipelines de agregação (heatmap + histórico) | P2 | M | — | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (com motivo em uma linha) | REJECTED (com justificativa em uma linha)

## Dependency notes

### Rodada 1
- **001 primeiro**: é o baseline de verificação — os gates de todos os outros planos ganham
  execução automática a partir dele.
- **005 requer 004**: os casos de regressão do 005 entram nos arquivos de teste que o 004 cria,
  e o 005 renomeia o mock de `@/lib/hour-bank` usado neles.
- **003 antes de 008 (recomendado)**: a verificação de hash assume que escrita client-direct já
  não existe; sem o lockdown ela ainda funciona, mas o cenário limpo é pós-003.
- **011 requer 001**: o bump de Node atualiza `netlify.toml` e o `ci.yml` juntos.
- **013 requer 006**: o spike de faturamento consome o contrato numérico de `hourlyRate` na API.
- **003 e 008 tocam produção** (banco único, previews compartilham o DB — ADR 0003): a APLICAÇÃO
  da migration do 003 é do operador, nunca do executor (STOP condition explícita no plano).

### Rodada 2
- **014 é o destravador**: resolve o drift de schema que quebra fresh-DB E completa o lockdown
  RLS (#2 user_settings, #3 users). Faça primeiro — 018 depende dele (o README e o checklist
  só ficam corretos pós-0007 aplicada).
- **018 requer 014 (recomendado)**: o passo de DB do README e a nota sobre regime RLS de
  `user_settings`/`users` no checklist só são confiáveis depois que a 0007 existe.
- **022 requer 016 (recomendado)**: ambos tocam `src/app/api/clock/[id]/route.ts`; 016 mexe na
  transação do PUT, 022 mexe no bloco de recálculo após a transação (`:363-366`). Fazer 016
  primeiro evita merge conflicts; se 022 for antes, re-leia o trecho atual antes de aplicar.
- **019 e 020 são independentes**: 019 adiciona react-doctor ao CI; 020 adiciona Biome. Não
  conflitam (gates diferentes); podem ir em qualquer ordem ou em paralelo.
- **023 e 024 são aditivos**: só criam test files, não tocam código de produção. Podem rodar em
  paralelo entre si e com qualquer outro plano.
- **014 e 017 tocam produção** (migrations 0007/0008): a APLICAÇÃO em produção é do operador,
  nunca do executor (STOP conditions explícitas em ambos).
- **015 é independente e LOW risk**: toca só `src/hooks/use-clock.ts` (cliente); pode rodar a
  qualquer momento, inclusive antes de 016 (que toca o server).

## Findings considered and rejected

- **Histórico pagina em memória (PERF)**: `buildHistoryData` traz o mês inteiro e faz
  `slice()` — mas a query já é limitada a um mês de um único usuário (dezenas de linhas);
  mover a paginação para SQL complicaria os filtros pós-split por dia BRT por ganho ~zero
  em app pessoal. Não vale fazer agora; revisitar se o produto virar multiusuário.
- **Sessão sub-2-minutos cruzando a meia-noite some dos relatórios (CORRECTNESS)**:
  `splitIntervalByLocalDay` descarta segmentos com 0 minutos "floored", então uma sessão de
  ~60–118s montada sobre a meia-noite persiste `totalMinutes=1` mas gera zero segmentos —
  invisível em Histórico/heatmap/hour_bank. Real, porém janela patológica com impacto de
  1 minuto; não vale um plano. Se os testes do plano 004 tocarem `dates.ts`, um caso de edge
  documentando o comportamento é bem-vindo. (O plano 024 inclui um characterization test
  deste edge case.)
- **Insights por activityType (DIRECTION)**: fundamentado (ADR 0003 criou a dimensão; o padrão
  `topProjectOf` é reaproveitável), mas o mantenedor escolheu priorizar o spike de faturamento.
  Registrado para o futuro — compartilharia a superfície de Insights com o 013.
- **`HistoricoClient` como god component (~736 linhas)**: real, mas já tem
  `react-doctor-disable-next-line` justificado; decisão assentida, não reportar.

## Não auditado (limites da auditoria de origem)

Internals do service worker (`src/app/sw.ts`), profundidade de `src/lib/server/auth.ts` e sessão
Supabase, qualidade individual dos specs e2e, e teste vivo das políticas RLS (achados baseados no
SQL das migrations). Uma auditoria `deep` futura pode cobrir esses pontos.
