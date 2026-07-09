# Plan 022: Reduzir round-trips e trabalho redundante no recálculo do hour-bank e no dashboard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 744da2b..HEAD -- src/lib/summary.ts src/lib/hour-bank.ts src/app/api/clock/[id]/route.ts src/lib/__tests__/hour-bank.test.ts src/lib/__tests__/user-settings-race.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/016-clock-out-race-guard.md (recomendado — ambos tocam `src/app/api/clock/[id]/route.ts`; 016 mexe na transação do PUT, 022 mexe no bloco de recálculo após a transação `:363-366`. Fazer 016 primeiro evita merge conflicts; se 016 já mesclou, re-leia o trecho atual antes de aplicar o Step 2)
- **Category**: perf
- **Planned at**: commit `744da2b`, 2026-07-09

## Why this matters

Três ineficiências no caminho do hour-bank e do dashboard que custam DB round-trips e
CPU em serverless (Netlify ↔ Supabase tem latência relevante, segundo AGENTS.md):

1. **`buildDailySummary` faz um round-trip DB sequencial extra** p/ saldo acumulado
   quando `showCumulativeBalance` é true com scope `since_start` (range largo, meses
   atrás). O `balanceEntries` já traz a união semana+mês, mas o range acumulado é mais
   amplo — dispara um 2º `fetchClosedEntries` após o `Promise.all` principal, no
   caminho crítico da página mais visitada.
2. **PATCH recalcula meses sobrepostos duas vezes** — `Promise.all` com dois
   `safeRecalculateHourBankForInterval` que, para edições no mesmo mês (caso comum),
   fazem `buildHourBankMonth` + `upsert` duplicado no mesmo mês.
3. **`buildHourBankMonth` computa `weeks` que o dashboard não consome** — o
   `buildDailySummary` lê só o mês, mas `buildHourBankMonth` calcula 4-5 semanas
   (cada uma filtra `splitIntervalByLocalDay` sobre todas as entries) a cada load do
   dashboard.

## Current state

### #21 — `buildDailySummary` round-trip extra

- `src/lib/summary.ts:83-86`:
  ```ts
  const monthBalance = await buildHourBankMonth(userId, todayDate.slice(0, 7), {
    settings,
    entries: intervals,
  })
  ```
  `intervals` = `balanceEntries` (`:70`), que cobre `[balanceStart, balanceEnd]`
  (união semana+mês). Mas quando `showCumulativeBalance` é true com scope `since_start`,
  `getCumulativeRange` (`src/lib/hour-bank.ts:142-172`) retorna `range.startDate =
  settings.cumulativeStartDate` (meses atrás), que **difere** de `startDate` (1º do
  mês) — disparando `fetchClosedEntries` em `:204-211`:
  ```ts
  const cumulativeEntries = range.startDate === startDate
    ? monthEntries
    : await fetchClosedEntries(userId, startOfLocalDayBRT(range.startDate), endExclusiveOfLocalDayBRT(range.endDate))
  ```
  Esse fetch extra é sequencial ao `Promise.all` em `summary.ts:46`.

### #22 — PATCH recalcula meses sobrepostos

- `src/app/api/clock/[id]/route.ts:363-366`:
  ```ts
  await Promise.all([
    safeRecalculateHourBankForInterval(user.id, entry.clockIn, entry.clockOut),
    safeRecalculateHourBankForInterval(user.id, newClockIn, newClockOut),
  ])
  ```
  Cada um resolve `months = new Set(splitIntervalByLocalDay(...).map(s => s.date.slice(0,7)))`
  e faz `Promise.all(months.map(m => buildHourBankMonth(userId, m, { persist: true,
  settings })))` (`hour-bank.ts:263-276`). Para uma edição no mesmo mês, ambos sets
  contêm o mesmo mês → `buildHourBankMonth` + `upsert` duplicado.

### #23 — `buildHourBankMonth` computa `weeks` sem necessidade

- `src/lib/hour-bank.ts:197-200`:
  ```ts
  const weeks = getWeekRangesForMonth(month, weekStartDay).map((range) =>
    buildPeriodBalanceFromEntries(monthEntries, range.startDate, range.endDate, workMinutesByWeekday)
  )
  ```
  `src/lib/summary.ts:83-99` lê só `expectedMinutes/actualMinutes/balanceMinutes/
  cumulativeBalance/showCumulativeBalance` — não lê `weeks`. Mas o trabalho de
  `buildPeriodBalanceFromEntries` (que filtra `splitIntervalByLocalDay` sobre todas as
  entries) é pago por cada semana, a cada load do dashboard.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/lib/hour-bank.ts` — adicionar option `computeWeeks` a `buildHourBankMonth`; adicionar helper `recalculateHourBankForIntervals` (plural) que dedupe meses
- `src/lib/summary.ts` — alargar `balanceEntries` p/ cobrir o range acumulado; passar `cumulativeEntries` para `buildHourBankMonth`; passar `computeWeeks: false`
- `src/app/api/clock/[id]/route.ts` — trocar os 2 `safeRecalculateHourBankForInterval` por 1 `safeRecalculateHourBankForIntervals` (plural)
- `src/lib/__tests__/hour-bank.test.ts` — ajustar testes de cumulative window (count de fetchClosedEntries muda) e adicionar caso de `computeWeeks: false`
- `src/lib/__tests__/user-settings-race.test.ts` — se exercita `buildHourBankMonth` com `entries`, confirmar que `computeWeeks` default não quebra

**Out of scope** (do NOT touch):
- `src/app/api/sync/route.ts` — o sync faz 1 `safeRecalculateHourBankForInterval` (não duplica); não precisa do helper plural.
- `src/app/historico/historico-client.tsx` — consome `weeks` do histórico; o `computeWeeks` default `true` preserva esse caminho.
- `src/lib/dates.ts` (`getWeekRangesForMonth`, `splitIntervalByLocalDay`) — não mudar.

## Git workflow

- Branch: `advisor/022-perf-hourbank-dashboard`
- Commit style: `perf(hour-bank): dedupe meses no recálculo do PATCH, elimina round-trip acumulado e weeks desnecessárias no dashboard`

## Steps

### Step 1: Adicionar `computeWeeks` option a `buildHourBankMonth`

Em `src/lib/hour-bank.ts`, na assinatura de `buildHourBankMonth` (`:174-182`), adicione
`computeWeeks?: boolean` ao options (default `true`, preservando o histórico):

```ts
export async function buildHourBankMonth(
  userId: string,
  month: string,
  options: {
    persist?: boolean
    defaultWorkHours?: number
    settings?: SerializedUserSettings
    entries?: ClockEntryInterval[]
    computeWeeks?: boolean
  } = {}
): Promise<HourBankMonth> {
```

E na computação das semanas (`:197-200`), guarde:

```ts
const computeWeeks = options.computeWeeks !== false
const weeks = computeWeeks
  ? getWeekRangesForMonth(month, weekStartDay).map((range) =>
      buildPeriodBalanceFromEntries(monthEntries, range.startDate, range.endDate, workMinutesByWeekday)
    )
  : []
```

Notas:
- O tipo de retorno `HourBankMonth.weeks` (`:35`) continua `PeriodBalance[]`; `[]` é
  válido. O `buildDailySummary` (`summary.ts:83-99`) não lê `weeks`, então `[]` é
  transparente.
- O histórico (`history.ts:111-114`) chama `buildHourBankMonth` sem `computeWeeks` →
  default `true` → `weeks` continua populado. Sem regressão.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Alargar `balanceEntries` e passar `computeWeeks: false` + `cumulativeEntries`

Em `src/lib/summary.ts`, o objetivo: uma única query (a `balanceEntries` em `:59-67`)
cobre mês + semana + acumulado. Para isso:

a) Compute o range acumulado **antes** da query, para alargar `balanceStart`:
```ts
import { getCumulativeRange } from '@/lib/hour-bank'  // precisa exportar getCumulativeRange
// ou duplicar a lógica mínima aqui — ver nota abaixo
```
Nota: `getCumulativeRange` (`hour-bank.ts:142-172`) é privada. **Decisão:** exportá-la
(não é duplicação — é reuso legítimo da fonte única). Adicione `export` a
`getCumulativeRange` em `hour-bank.ts:142`.

Em `buildDailySummary`, antes do `Promise.all`:
```ts
const cumulativeRange = settings.showCumulativeBalance
  ? getCumulativeRange(todayDate.slice(0, 7), settings)
  : null
const cumulativeStart = cumulativeRange
  ? startOfLocalDayBRT(cumulativeRange.startDate)
  : todayStart
const extendedBalanceStart = earlierDate(cumulativeStart, balanceStart)
```

E alarge a query `balanceEntries` (`:59-67`) para usar `extendedBalanceStart`:
```ts
prisma.clockEntry.findMany({
  where: {
    userId,
    deletedAt: null,
    clockOut: { not: null, gt: extendedBalanceStart },
    clockIn: { lt: balanceEnd },
  },
  select: { clockIn: true, clockOut: true },
}),
```

b) Passe `entries: intervals` (que agora cobre o range estendido) e
`computeWeeks: false` para `buildHourBankMonth` (`:83`):
```ts
const monthBalance = await buildHourBankMonth(userId, todayDate.slice(0, 7), {
  settings,
  entries: intervals,
  computeWeeks: false,
})
```

Como `intervals` agora cobre o range acumulado (até `cumulativeStart`), a checagem em
`hour-bank.ts:204-211` (`range.startDate === startDate ? monthEntries : await
fetchClosedEntries(...)`) ainda dispara o fetch extra porque `monthEntries` passado via
`options.entries` é o `intervals` (range estendido), não o range do mês. **Atenção:**
precisa garantir que `buildHourBankMonth` use `intervals` filtrados para o mês p/ o
`monthBalance` (ele já filtra via `buildPeriodBalanceFromEntries(monthEntries,
startDate, endDate, ...)` onde `startDate/endDate` é o mês — o `buildPeriodBalanceFromEntries`
filtra segmentos por data, ver `hour-bank.ts:59-72`). Então passar `intervals`
estendido é seguro: o `monthBalance` filtra só os do mês; o `cumulativeEntries` path
precisa de `intervals` estendido.

Mas o path `cumulativeEntries` (`:204-211`) checa `range.startDate === startDate` —
agora `range.startDate` (acumulado) ainda ≠ `startDate` (mês), então dispara o fetch.
Para evitar isso, adicione option `cumulativeEntries?: ClockEntryInterval[]` a
`buildHourBankMonth` e, quando presente, use-o em vez de `fetchClosedEntries`:
```ts
const cumulativeEntries = options.cumulativeEntries ?? (
  range.startDate === startDate
    ? monthEntries
    : await fetchClosedEntries(userId, startOfLocalDayBRT(range.startDate), endExclusiveOfLocalDayBRT(range.endDate))
)
```

E em `summary.ts`, passe `cumulativeEntries: intervals` (mesmo array estendido —
`buildPeriodBalanceFromEntries` filtra por `range.startDate..endDate` que é o range
acumulado).

Resultado: 1 query total (a `balanceEntries` estendida), zero fetches sequenciais.

**Verify**: `npx tsc --noEmit` → exit 0. `npm test -- hour-bank` → ajuste esperado (ver Step 4).

### Step 3: Helper plural `recalculateHourBankForIntervals` e uso no PATCH

Em `src/lib/hour-bank.ts`, adicione um helper que dedupe meses de múltiplos intervalos:

```ts
export async function recalculateHourBankForIntervals(
  userId: string,
  intervals: Array<{ clockIn: Date; clockOut: Date | null }>
): Promise<void> {
  const settings = await getOrCreateUserSettings(userId)
  const months = new Set<string>()
  for (const { clockIn, clockOut } of intervals) {
    if (!clockOut) continue
    for (const seg of splitIntervalByLocalDay(clockIn, clockOut)) {
      months.add(seg.date.slice(0, 7))
    }
  }
  if (settings.showCumulativeBalance) {
    months.add(getLocalDateBRT().slice(0, 7))
  }
  await Promise.all(
    Array.from(months).map((month) =>
      buildHourBankMonth(userId, month, { persist: true, settings })
    )
  )
}

export async function safeRecalculateHourBankForIntervals(
  userId: string,
  intervals: Array<{ clockIn: Date; clockOut: Date | null }>
): Promise<void> {
  try {
    await recalculateHourBankForIntervals(userId, intervals)
  } catch (error) {
    console.error('[hour-bank] recálculo falhou (mutação primária já commitada)', {
      userId, error,
    })
  }
}
```

Em `src/app/api/clock/[id]/route.ts:363-366`, troque:
```ts
await Promise.all([
  safeRecalculateHourBankForInterval(user.id, entry.clockIn, entry.clockOut),
  safeRecalculateHourBankForInterval(user.id, newClockIn, newClockOut),
])
```
por:
```ts
await safeRecalculateHourBankForIntervals(user.id, [
  { clockIn: entry.clockIn, clockOut: entry.clockOut },
  { clockIn: newClockIn, clockOut: newClockOut },
])
```
Atualize o import de `@/lib/hour-bank` (remova `safeRecalculateHourBankForInterval`
singular se não usado; adicione `safeRecalculateHourBankForIntervals`).

Nota: o log de erro do `safeRecalculate...` plural não loga `clockIn`/`clockOut`
individualmente (são múltiplos) — logar `userId` + error é suficiente (o singular
continua disponível para o sync que usa 1 interval).

**Verify**: `npx tsc --noEmit` → exit 0. `rg -n "safeRecalculateHourBankForInterval\b"
src/app/api/clock/[id]/route.ts` → zero (singular); `rg -n
"safeRecalculateHourBankForIntervals" src/app/api/clock/[id]/route.ts` → match.

### Step 4: Ajustar testes

Em `src/lib/__tests__/hour-bank.test.ts`:
- O teste "uses the selected rolling cumulative window" (`:108-140`) hoje espera
  `clockEntryFindMany` chamado **2 vezes** (`:129`). Após o Step 2, se o teste exercita
  `buildHourBankMonth` diretamente sem `cumulativeEntries`, o comportamento não muda
  (o option `cumulativeEntries` é opcional). Confirme: o teste chama
  `buildHourBankMonth('user-1', '2026-04')` sem `cumulativeEntries` → ainda faz 2 fetches.
  **Sem mudança neste teste.**
- Adicione um caso `computeWeeks: false`: chame `buildHourBankMonth` com `computeWeeks:
  false` e assera `result.weeks` é `[]`.
- Adicione um caso `cumulativeEntries` fornecido: chame com `cumulativeEntries:
  [...]` e assera `clockEntryFindMany` é chamado **1 vez** (só o mês, não o acumulado).

Em `src/lib/__tests__/user-settings-race.test.ts`: se exercita `buildHourBankMonth` com
`entries`, confirme que `computeWeeks` default `true` não quebra o assertion de `weeks`.

**Verify**: `npm test -- hour-bank user-settings-race` → all pass.

### Step 5: Suite completa + build

**Verify**: `npm test && npm run build` → ambos exit 0.

## Test plan

- `src/lib/__tests__/hour-bank.test.ts`:
  - Novo caso: `buildHourBankMonth` com `computeWeeks: false` → `weeks === []`.
  - Novo caso: `buildHourBankMonth` com `cumulativeEntries` fornecido →
    `clockEntryFindMany` chamado 1 vez (não 2).
  - Caso existente "rolling cumulative window" permanece (2 fetches quando
    `cumulativeEntries` não é passado) — confirma que o path antigo não regrediu.
- `src/app/api/clock/[id]/route.test.ts`: o teste "edits a closed entry... recalculates
  both intervals" (`:216-247`) hoje espera
  `safeRecalculateHourBankForIntervalMock` chamado **2 vezes** (`:244`). Após o Step 3,
  o mock é `safeRecalculateHourBankForIntervals` (plural) chamado **1 vez** com o array
  de 2 intervalos. Atualize o assertion:
  ```ts
  expect(safeRecalculateHourBankForIntervalsMock).toHaveBeenCalledTimes(1)
  expect(safeRecalculateHourBankForIntervalsMock).toHaveBeenCalledWith('user-1', [
    { clockIn: entry.clockIn, clockOut: entry.clockOut },
    { clockIn: expect.any(Date), clockOut: expect.any(Date) },
  ])
  ```
  Atualize o mock no topo do arquivo (`vi.mock('@/lib/hour-bank', ...)`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0; novos casos de `computeWeeks` e `cumulativeEntries` passam; teste do PATCH atualizado passa
- [ ] `npm run build` exits 0
- [ ] `rg -n "computeWeeks" src/lib/hour-bank.ts` → retorna match na assinatura
- [ ] `rg -n "cumulativeEntries" src/lib/hour-bank.ts` → retorna match
- [ ] `rg -n "getCumulativeRange" src/lib/hour-bank.ts` → retorna `export function getCumulativeRange`
- [ ] `rg -n "safeRecalculateHourBankForInterval\b" src/app/api/clock/[id]/route.ts` → zero (singular removido)
- [ ] `rg -n "safeRecalculateHourBankForIntervals" src/app/api/clock/[id]/route.ts` → match (plural)
- [ ] Nenhum arquivo fora da lista de escopo foi modificado
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Exportar `getCumulativeRange` quebra alguma invariant (ex: ela lê `settings` que
  `summary.ts` já tem — confirme que a signature `(month, settings)` é suficiente).
- Passar `intervals` estendido para `buildHourBankMonth` via `entries` muda o
  `monthBalance` (o `buildPeriodBalanceFromEntries` deve filtrar por `startDate..endDate`
  do mês — confirme em `hour-bank.ts:59-72` que o filtro por data está correto; se não
  filtra, `monthBalance` somaria minutos de outros meses — STOP e reporte).
- O plano 016 ainda não mesclou e o trecho `:363-366` de `clock/[id]/route.ts` mudou —
  re-leia o trecho atual antes de aplicar o Step 3.
- O teste "rolling cumulative window" falha após o Step 2 — pode indicar que o option
  `cumulativeEntries` não está sendo respeitado no path de fetch; reporte antes de
  ajustar a lógica.

## Maintenance notes

- O helper plural `recalculateHourBankForIntervals` é reutilizável: se o sync futuramente
  fizer recálculo de múltiplos intervalos (ex: batch de syncs), pode usá-lo.
- O `computeWeeks: false` é transparente para o histórico (default `true`). Se o
  histórico passar a não precisar de `weeks`, pode adotar `computeWeeks: false` também
  (a `HourBankMonth.weeks` viraria `[]` e o cliente lida com isso).
- A exportação de `getCumulativeRange` abre a API p/ reuso — se ela divergir de
  `buildHourBankMonth`, ambos quebram; manter coeso.
- Um reviewer do PR deve confirmar: (a) o `monthBalance` do dashboard não somou minutos
  de outros meses (o filtro por data em `buildPeriodBalanceFromEntries` é o guard); (b)
  o recálculo do PATCH agora faz 1 `upsert` por mês único (não 2 por mês sobreposto).
