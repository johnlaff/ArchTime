# Implementation Plans

Gerados pelo skill improve em 2026-07-03, a partir de auditoria `standard` no commit `e52a5ad`.
Execute na ordem abaixo salvo indicação contrária das dependências. Cada executor: leia o plano
inteiro antes de começar, honre as STOP conditions e atualize sua linha ao terminar.

> Nota: `docs/plans/` é um diretório histórico de planejamento de features, sem relação com este.
> Os planos de execução do advisor vivem aqui em `plans/`.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | CI no GitHub Actions (tsc + testes + build em PR) | P1 | S | — | DONE |
| 002 | /api/sync invalida cache tags do dashboard | P1 | S | — | DONE |
| 003 | RLS: travar INSERT/UPDATE client-direct | P1 | M | 001 (recomendado) | IN PROGRESS (migration criada; aplicação em produção pendente de autorização do operador) |
| 004 | Testes das rotas de clock + fila offline | P1 | M | — | DONE |
| 005 | Guard no recálculo do hour_bank pós-commit | P2 | M | 004 | DONE |
| 006 | AuditLog em projects + hourlyRate numérico | P2 | S | — | DONE |
| 007 | Teste de paridade do script anti-flash | P2 | S | — | DONE |
| 009 | Headers de hardening (CSP report-only) | P2 | M | — | DONE (sweep autenticado pendente antes de promover CSP a enforce) |
| 008 | Verificação do hash de integridade (/api/integrity) | P3 | M | 003 (recomendado) | DONE |
| 010 | Rodapé do Histórico: "registros", não "sessões" | P3 | S | — | DONE |
| 011 | Higiene: README real, SVGs órfãos, Node 22 | P3 | S | 001 | TODO |
| 012 | Guard de resposta obsoleta no useSupabaseQuery | P3 | S | — | TODO |
| 013 | Spike de design: faturamento (horas × hourlyRate) | P3 | M | 006 | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (com motivo em uma linha) | REJECTED (com justificativa em uma linha)

## Dependency notes

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
  documentando o comportamento é bem-vindo.
- **Insights por activityType (DIRECTION)**: fundamentado (ADR 0003 criou a dimensão; o padrão
  `topProjectOf` é reaproveitável), mas o mantenedor escolheu priorizar o spike de faturamento.
  Registrado para o futuro — compartilharia a superfície de Insights com o 013.

## Não auditado (limites da auditoria de origem)

Internals do service worker (`src/app/sw.ts`), profundidade de `src/lib/server/auth.ts` e sessão
Supabase, qualidade individual dos specs e2e, e teste vivo das políticas RLS (achados baseados no
SQL das migrations). Uma auditoria `deep` futura pode cobrir esses pontos.
