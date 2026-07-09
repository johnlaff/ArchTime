# Plan 024: Testes para os pipelines de agregação do dashboard e do histórico

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 744da2b..HEAD -- src/lib/server/activity-data.ts src/lib/history.ts src/lib/__tests__/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (independente do plano 022, que toca `hour-bank.ts`/`summary.ts`;
  este toca testes de `activity-data.ts`/`history.ts`)
- **Category**: tests
- **Planned at**: commit `744da2b`, 2026-07-09

## Why this matters

Dois pipelines de agregação centrais sem teste direto:
1. `fetchHeatmapDays`/`fetchWeekMinutes` (`src/lib/server/activity-data.ts`) — a tela
   mais vista do dashboard. Funções `'use cache'` com query Prisma + `splitIntervalByLocalDay`
   + zero-fill de janela + `topProjectOf` (tie-break). Regressão na math de bucketing
   renderizaria errado silenciosamente. A math pura de `splitIntervalByLocalDay` é
   testada (`dates.test.ts`), mas a integração query+bucket+zero-fill+topProject não é.
2. `buildHistoryData` (`src/lib/history.ts:16-93`) — query + segment-split + filter +
   paginação. Core do Histórico. O edge case sub-2min cruzando meia-noite (documentado em
   `plans/README.md:49-54` como "real, porém janela patológica") segue sem coverage.

## Current state

### #19 — activity-data

- `src/lib/server/activity-data.ts:35-92` — `fetchHeatmapDays`: `'use cache'` +
  `cacheTag('sidebar-${userId}')` + `prisma.clockEntry.findMany` (range de 11 meses) +
  loop sobre `splitIntervalByLocalDay` por entry + `byDate` Map + zero-fill (loop
  `cursor` de `startDate` a `todayDate`) + `topProjectOf`.
- `src/lib/server/activity-data.ts:16-26` — `topProjectOf`: itera `Map<string, number>`,
  escolhe o de maior `minutes`. **Tie-break:** `if (minutes > bestMinutes)` — estrito,
  então em empate mantém o primeiro encontrado (ordem de inserção do Map). Documentar.
- `src/lib/server/activity-data.ts:95-128` — `fetchWeekMinutes`: bucketing de 7 dias
  via `splitIntervalByLocalDay`.
- Padrão de teste para `'use cache'`: `src/lib/__tests__/sidebar-data.test.ts:1-19`:
  ```ts
  vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }))
  vi.mock('react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react')>()),
    cache: (fn: (...args: unknown[]) => unknown) => fn,
  }))
  vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: vi.fn() } }))
  const { fetchActiveProjects } = await import('../server/sidebar-data')
  ```
  Use o mesmo padrão (mock `next/cache` como no-ops, `react.cache` como passthrough).

### #20 — buildHistoryData

- `src/lib/history.ts:16-93` — `buildHistoryData`: `prisma.clockEntry.findMany` (range
  do mês) + `splitIntervalByLocalDay` por entry (filtra segmentos no mês) + ordenação
  (data desc, clockIn desc) + `matchesFilters` + `slice()` paginação.
- `src/lib/__tests__/history-filters.test.ts` — testa `matchesFilters`/`hasActiveFilters`
  (lógica pura), **não** `buildHistoryData`.
- `src/lib/__tests__/history-client.test.ts` — testa `parseHistoryBundleResponse`.
- Não existe `src/lib/__tests__/history.test.ts`.
- `src/app/api/history/route.test.ts:4-6` — `vi.mock('@/lib/history', () => ({ buildHistoryBundle: vi.fn() }))` — a rota também mocka o módulo todo.
- Edge case documentado: `plans/README.md:49-54` — sessão sub-2min cruzando meia-noite
  persiste `totalMinutes=1` mas gera zero segmentos (`splitIntervalByLocalDay` descarta
  `minutes` floored em 0). Um characterization test documentando o comportamento é
  bem-vindo.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/lib/__tests__/activity-data.test.ts` (create) — testes de `fetchHeatmapDays` e `fetchWeekMinutes`
- `src/lib/__tests__/history.test.ts` (create) — teste de `buildHistoryData`

**Out of scope** (do NOT touch):
- `src/lib/server/activity-data.ts` — código de produção; só testes.
- `src/lib/history.ts` — código de produção; só testes.
- `src/lib/__tests__/history-filters.test.ts` — já cobre `matchesFilters`/`hasActiveFilters`; não duplicar.
- `src/app/api/activity/overview/route.ts`, `src/app/api/history/route.ts` — rotas; já têm testes próprios.

## Git workflow

- Branch: `advisor/024-tests-aggregation-pipelines`
- Commit style: `test: cobre fetchHeatmapDays/fetchWeekMinutes e buildHistoryData`

## Steps

### Step 1: Criar `src/lib/__tests__/activity-data.test.ts`

Modele em `src/lib/__tests__/sidebar-data.test.ts` (mocks de `next/cache` + `react.cache`
+ `@/lib/prisma`). Aqui o mock de prisma precisa de `prisma.clockEntry.findMany` (não
`$queryRaw`).

Estrutura alvo:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: (fn: (...args: unknown[]) => unknown) => fn,
}))
vi.mock('@/lib/prisma', () => ({ prisma: { clockEntry: { findMany: vi.fn() } } }))

const { fetchHeatmapDays, fetchWeekMinutes } = await import('../server/activity-data')
const { prisma } = await import('@/lib/prisma')

function entry(overrides: Partial<{ id: string; clockIn: Date; clockOut: Date; allocations: unknown[] }> = {}) {
  return {
    id: 'e1',
    clockIn: new Date('2026-07-09T13:00:00.000Z'),  // 10:00 BRT
    clockOut: new Date('2026-07-09T17:00:00.000Z'), // 14:00 BRT
    allocations: [],
    ...overrides,
  }
}
```

Casos para `fetchHeatmapDays`:
- **Split por dia BRT:** uma entry cruzando meia-noite (clockIn 23:00 BRT, clockOut
  01:00 BRT do dia seguinte) gera 2 buckets com minutos split corretamente (60 min no
  dia 1, 60 min no dia 2).
- **Zero-fill:** dias sem atividade na janela aparecem com `totalMinutes: 0` e
  `sessionCount: 0`.
- **`topProjectOf` escolhe o de maior minutos:** entry com allocation `project.name:
  'Projeto A'` (120 min) e outra com `'Projeto B'` (60 min) no mesmo dia → `topProject:
  'Projeto A'`.
- **`topProjectOf` tie-break (documenta comportamento):** duas entries mesmo dia, mesmo
  projeto, minutos iguais → `topProject` é o primeiro inserido (ordem do Map, que segue
  a ordem das entries). Documente no teste que o empate mantém o primeiro.

Casos para `fetchWeekMinutes`:
- **Bucket de 7 dias:** uma entry no meio da semana aparece só no dia correto; os
  outros 6 dias ficam com `totalMinutes: 0`.
- **Entry cruzando meia-noite dentro da semana:** split entre os dois dias.

Atenção: `fetchHeatmapDays`/`fetchWeekMinutes` usam `getLocalDateBRT()` e
`getWeekRangeBRT(new Date(), weekStartDay)` internamente — dependem do "hoje". Para
testes determinísticos, escolha ranges que não dependam do horário exato do teste (ex:
mockar `Date` com `vi.useFakeTimers().setSystemTime(new Date('2026-07-09T15:00:00Z'))`
para fixar o "hoje", e alimentar entries dentro da janela). Use `vi.useFakeTimers` +
`vi.setSystemTime` e `vi.useRealTimers` no `afterEach`.

**Verify**: `npm test -- activity-data` → all pass.

### Step 2: Criar `src/lib/__tests__/history.test.ts`

Modele em `src/lib/__tests__/hour-bank.test.ts` (mock de `@/lib/prisma`). `buildHistoryData`
usa `prisma.clockEntry.findMany` com include de allocations.

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { clockEntry: { findMany: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { buildHistoryData } from '../history'

const clockEntryFindMany = vi.mocked(prisma.clockEntry).findMany as unknown as Mock
```

Casos:
- **Split por dia BRT (segmentação):** uma entry cruzando meia-noite (clockIn 23:00,
  clockOut 01:00) vira 2 segmentos com `segmentMinutes` split (60 + 60) e
  `isPartial: true`.
- **`totalMinutes` da página soma `segmentMinutes` (não `totalEntryMinutes`):** uma entry
  de 2h que cruza meia-noite dentro do mês → `history.totalMinutes === 120` (soma dos
  segmentos), mesmo que `totalEntryMinutes` seja 120 (neste caso coincidem; use uma
  entry que cruza **para fora do mês** para diferenciar: a parte do outro mês é
  filtrada e `totalMinutes` só soma o segmento dentro do mês).
- **`hasMore` vira no limite da página:** alimente `pageSize + 1` segmentos e assera
  `hasMore: true` na page 1.
- **Edge case sub-2min cruzando meia-noite (characterization):** uma entry com
  clockIn 23:59:00 e clockOut 00:00:30 (dia seguinte) — `totalMinutes` persistido seria
  ~1, mas `splitIntervalByLocalDay` gera zero segmentos (minutos floored em 0). O
  resultado: a entry some dos segmentos do histórico. **Documente** este comportamento
  no teste (com comentário "caracterização — ver plans/README.md edge case rejeitado")
  para travar que mudanças em `splitIntervalByLocalDay` não alterem isto silenciosamente.

Atenção: `buildHistoryData` não lê `settings` (só `getMonthRangeBRT` + prisma + filters).
Não mocke `@/lib/user-settings` a menos que o import real force (confira os imports de
`history.ts:1-7` — ele importa `buildHourBankMonth` e `getOrCreateUserSettings`, mas
`buildHistoryData` em si não os chama; `buildHistoryBundle` sim). Teste só
`buildHistoryData`, não `buildHistoryBundle` (que puxa settings/hourBank e é mais
complexo — fora deste plano).

**Verify**: `npm test -- history` → all pass.

### Step 3: Suite completa + build

**Verify**: `npm test && npm run build` → ambos exit 0.

## Test plan

- `src/lib/__tests__/activity-data.test.ts`: ~6 casos (split por dia, zero-fill,
  topProject maior, topProject tie-break, week bucket, week split). Modelar em
  `sidebar-data.test.ts`.
- `src/lib/__tests__/history.test.ts`: ~4 casos (split por dia, totalMinutes soma
  segmentos, hasMore, edge case sub-2min characterization). Modelar em `hour-bank.test.ts`.
- Use `vi.useFakeTimers`/`vi.setSystemTime` para fixar o "hoje" nos testes de
  `activity-data` (que dependem de `getLocalDateBRT()`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0; novos testes em `activity-data.test.ts` e `history.test.ts` passam
- [ ] `npm run build` exits 0
- [ ] `src/lib/__tests__/activity-data.test.ts` existe e cobre `fetchHeatmapDays` + `fetchWeekMinutes`
- [ ] `src/lib/__tests__/history.test.ts` existe e cobre `buildHistoryData`
- [ ] `src/lib/server/activity-data.ts` e `src/lib/history.ts` não foram modificados
- [ ] Nenhum arquivo fora da lista de escopo foi modificado
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- As funções `'use cache'` (`fetchHeatmapDays`/`fetchWeekMinutes`) não rodam no Vitest
  com o mock de `next/cache` (ex: o `cacheLife`/`cacheTag` chamados na execução não são
  no-ops como esperado, ou `'use cache'` exige runtime do Next) — reporte; pode precisar
  de mock adicional ou de testar a lógica de bucketing extraindo-a p/ uma função pura.
- `buildHistoryData` depende de `getOrCreateUserSettings` transitivamente (via import)
  mesmo sem chamar — pode ser necessário mockar `@/lib/user-settings` para evitar erro de
  inicialização; reporte a dependência real.
- O edge case sub-2min não reproduz no teste (ex: `splitIntervalByLocalDay` mudou desde
  a documentação em `plans/README.md`) — o teste de caracterização deve refletir o
  comportamento **atual**; se mudou, documente o novo comportamento e reporte.

## Maintenance notes

- O teste de tie-break do `topProjectOf` documenta a decisão "primeiro inserido vence".
  Se o mantenedor quiser determinismo diferente (ex: ordem alfabética no empate), o
  teste falha e sinaliza a mudança deliberada.
- O characterization test do edge case sub-2min **não** é um bug a corrigir (já foi
  rejeitado em `plans/README.md:49-54`); é uma travamento do comportamento atual. Se
  `splitIntervalByLocalDay` for alterada para produzir segmentos sub-1min, o teste
  falha e força a decisão explícita.
- Se `buildHistoryBundle` passar a ter lógica de agregação própria (hoje só orquestra),
  adicione testes em `history.test.ts` para ela.
- Um reviewer do PR deve confirmar que os testes de `activity-data` fixam o "hoje"
  com `vi.setSystemTime` (senão são não-determinísticos).
