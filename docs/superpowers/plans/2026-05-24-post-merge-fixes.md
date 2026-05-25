# Post-Merge Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix keyboard navigation latency, add optimistic UI to clock-in/out, and implement a user-configurable week start day preference.

**Architecture:** Three independent improvements to an existing Next.js 15 App Router app: (1) wrap keyboard `router.push` calls in React `startTransition` and prefetch routes on mount, (2) set optimistic React state before API calls with rollback on failure, (3) add a new `weekStartDay` Prisma field that flows from settings → API → date-calculation utility → UI.

**Tech Stack:** Next.js 15 App Router, React `useTransition`, TypeScript, Prisma ORM (PostgreSQL), Vitest, Sonner toasts

---

## File Map

| File | Change |
|---|---|
| `src/hooks/use-keyboard-shortcuts.ts` | Add `useTransition`, `startTransition`, `router.prefetch()` on mount |
| `src/hooks/use-clock.ts` | Optimistic clock-in (set session before API) and clock-out (clear session before API) with rollback |
| `src/lib/preferences.ts` | Add `WEEK_START_DAYS` constant and `WeekStartDay` type |
| `prisma/schema.prisma` | Add `weekStartDay String @default("monday")` to `UserSettings` |
| `src/lib/user-settings.ts` | Add `weekStartDay` to `SerializedUserSettings`, `SettingsPatch`, `serialize()`, `parseSettingsPatch()`, `updateUserSettings()` |
| `src/lib/dates.ts` | Parameterize `getWeekRangesForMonth(month, weekStartDay: 0 \| 1 = 1)` |
| `src/lib/hour-bank.ts` | Pass `weekStartDay` from settings to `getWeekRangesForMonth` |
| `src/app/configuracoes/configuracoes-client.tsx` | Add week start day segmented control to UI |
| `src/lib/__tests__/dates.test.ts` | Add Sunday-start test cases for `getWeekRangesForMonth` |
| `src/lib/__tests__/user-settings.test.ts` | Add test: reject invalid `weekStartDay`, accept valid values |

---

## Task 1: Fix Keyboard Navigation Latency

**Files:**
- Modify: `src/hooks/use-keyboard-shortcuts.ts`

### Why this fixes it

`router.push()` called from a DOM event listener (outside React's scheduler) blocks the current page until the RSC payload is fetched. Wrapping it in `startTransition` tells React to keep the current page interactive and treat the fetch as a background transition. `router.prefetch()` on mount warms the RSC cache so by the time the user presses a key, the payload is already there.

- [ ] **Step 1: Write the failing source-guard test**

Add to `src/lib/__tests__/review-feedback-source.test.ts` — inside the `describe('review feedback regressions', ...)` block, after the last existing `it(...)`:

```ts
it('wraps keyboard navigation in startTransition to avoid blocking the current page', () => {
  const source = readSource('src/hooks/use-keyboard-shortcuts.ts')

  expect(source).toContain('startTransition')
  expect(source).toContain("router.prefetch('/dashboard')")
  expect(source).toContain("router.prefetch('/historico')")
  expect(source).toContain("router.prefetch('/projetos')")
  expect(source).toContain("router.prefetch('/configuracoes')")
  expect(source).not.toMatch(/case 'p':\s*router\.push/)
})
```

- [ ] **Step 2: Run test to confirm it fails**

```
npx vitest run src/lib/__tests__/review-feedback-source.test.ts
```

Expected: FAIL — `expect(source).toContain('startTransition')` fails.

- [ ] **Step 3: Replace `use-keyboard-shortcuts.ts` with the fixed version**

Replace the entire file content:

```ts
'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface KeyboardShortcutsOptions {
  onThemeToggle: () => void
}

function isInteractiveElement(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    el.hasAttribute('contenteditable')
  ) return true
  if (el.closest('[role="dialog"], [data-radix-popper-content-wrapper], [data-state="open"]')) return true
  return false
}

export function useKeyboardShortcuts({ onThemeToggle }: KeyboardShortcutsOptions) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  useEffect(() => {
    router.prefetch('/dashboard')
    router.prefetch('/historico')
    router.prefetch('/projetos')
    router.prefetch('/configuracoes')
  }, [router])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isInteractiveElement()) return

      switch (e.key.toLowerCase()) {
        case 'p':
          startTransition(() => router.push('/dashboard'))
          break
        case 'h':
          startTransition(() => router.push('/historico'))
          break
        case 'j':
          startTransition(() => router.push('/projetos'))
          break
        case 'c':
          startTransition(() => router.push('/configuracoes'))
          break
        case 't':
          onThemeToggle()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router, startTransition, onThemeToggle])
}
```

- [ ] **Step 4: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-keyboard-shortcuts.ts src/lib/__tests__/review-feedback-source.test.ts
git commit -m "perf: wrap keyboard nav in startTransition; prefetch routes on mount"
```

---

## Task 2: Optimistic Clock-In

**Files:**
- Modify: `src/hooks/use-clock.ts`

### What changes

For the **online** clock-in path only: set an optimistic session (with a temporary ID) before the API call so the UI flips to "clocked in" state immediately. On success, update the session with the real server ID. On failure, roll back to `null` and show an error toast.

The offline path is unchanged — it already sets state before writing to the queue.

- [ ] **Step 1: Replace the `clockIn` callback in `use-clock.ts`**

The file currently exports `useClock`. Change only the `clockIn` function body. The complete new `use-clock.ts`:

```ts
'use client'

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { addPendingEntry } from '@/lib/offline-queue'
import type { ActiveSession } from '@/types'

interface UseClockReturn {
  session: ActiveSession | null
  setSession: (s: ActiveSession | null) => void
  clockIn: (projectId: string | null) => Promise<void>
  clockOut: () => Promise<void>
  loading: boolean
}

export function useClock(initialSession: ActiveSession | null): UseClockReturn {
  const [session, setSession] = useState<ActiveSession | null>(initialSession)
  const [loading, setLoading] = useState(false)
  const clockInFlightRef = useRef(false)

  const clockIn = useCallback(async (projectId: string | null) => {
    if (!navigator.onLine) {
      const id = crypto.randomUUID()
      const timestamp = new Date().toISOString()
      await addPendingEntry({
        id,
        entryId: id,
        type: 'clock_in',
        timestamp,
        projectId: projectId ?? undefined,
        createdAt: timestamp,
      })
      setSession({
        id,
        clockIn: timestamp,
        projectId,
        projectName: null,
        projectColor: null,
      })
      toast.warning('Entrada salva offline. Será sincronizada ao reconectar.')
      return
    }

    const optimisticId = crypto.randomUUID()
    setSession({
      id: optimisticId,
      clockIn: new Date().toISOString(),
      projectId,
      projectName: null,
      projectColor: null,
    })
    setLoading(true)
    clockInFlightRef.current = true

    try {
      const res = await fetch('/api/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Erro ao registrar entrada')
        setSession(null)
        return
      }
      const entry = await res.json()
      setSession({
        id: entry.id,
        clockIn: entry.clockIn,
        projectId: projectId ?? null,
        projectName: null,
        projectColor: null,
      })
      toast.success('Entrada registrada!')
    } catch {
      toast.error('Erro ao registrar entrada')
      setSession(null)
    } finally {
      clockInFlightRef.current = false
      setLoading(false)
    }
  }, [])

  const clockOut = useCallback(async () => {
    if (!session) return
    if (clockInFlightRef.current) return
    setLoading(true)
    try {
      if (navigator.onLine) {
        const res = await fetch(`/api/clock/${session.id}`, { method: 'PUT' })
        if (!res.ok) {
          toast.error('Erro ao registrar saída')
          return
        }
        toast.success('Saída registrada!')
      } else {
        const timestamp = new Date().toISOString()
        await addPendingEntry({
          id: crypto.randomUUID(),
          entryId: session.id,
          type: 'clock_out',
          timestamp,
          createdAt: timestamp,
        })
        toast.warning('Saída salva offline. Será sincronizada ao reconectar.')
      }
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [session])

  return { session, setSession, clockIn, clockOut, loading }
}
```

- [ ] **Step 2: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass (no existing test covers the clock hook directly).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-clock.ts
git commit -m "perf: optimistic clock-in — show session immediately before API confirms"
```

---

## Task 3: Optimistic Clock-Out

**Files:**
- Modify: `src/hooks/use-clock.ts`

### What changes

For the **online** clock-out path: save a snapshot of the current session, set `session = null` immediately (UI flips to "clocked out"), then call the API. If the API fails, restore the session from the snapshot and show an error toast.

This is already wired up in Task 2's implementation — the `clockOut` function in the code written in Task 2 doesn't yet do the optimistic null-set. Let me clarify: the Task 2 code still awaits the API before calling `setSession(null)`. This task changes that.

- [ ] **Step 1: Update `clockOut` in `src/hooks/use-clock.ts` to be optimistic**

Replace only the `clockOut` callback. The full replacement for `use-clock.ts` (complete file — copy from Task 2 then apply this change to `clockOut`):

```ts
'use client'

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { addPendingEntry } from '@/lib/offline-queue'
import type { ActiveSession } from '@/types'

interface UseClockReturn {
  session: ActiveSession | null
  setSession: (s: ActiveSession | null) => void
  clockIn: (projectId: string | null) => Promise<void>
  clockOut: () => Promise<void>
  loading: boolean
}

export function useClock(initialSession: ActiveSession | null): UseClockReturn {
  const [session, setSession] = useState<ActiveSession | null>(initialSession)
  const [loading, setLoading] = useState(false)
  const clockInFlightRef = useRef(false)

  const clockIn = useCallback(async (projectId: string | null) => {
    if (!navigator.onLine) {
      const id = crypto.randomUUID()
      const timestamp = new Date().toISOString()
      await addPendingEntry({
        id,
        entryId: id,
        type: 'clock_in',
        timestamp,
        projectId: projectId ?? undefined,
        createdAt: timestamp,
      })
      setSession({
        id,
        clockIn: timestamp,
        projectId,
        projectName: null,
        projectColor: null,
      })
      toast.warning('Entrada salva offline. Será sincronizada ao reconectar.')
      return
    }

    const optimisticId = crypto.randomUUID()
    setSession({
      id: optimisticId,
      clockIn: new Date().toISOString(),
      projectId,
      projectName: null,
      projectColor: null,
    })
    setLoading(true)
    clockInFlightRef.current = true

    try {
      const res = await fetch('/api/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Erro ao registrar entrada')
        setSession(null)
        return
      }
      const entry = await res.json()
      setSession({
        id: entry.id,
        clockIn: entry.clockIn,
        projectId: projectId ?? null,
        projectName: null,
        projectColor: null,
      })
      toast.success('Entrada registrada!')
    } catch {
      toast.error('Erro ao registrar entrada')
      setSession(null)
    } finally {
      clockInFlightRef.current = false
      setLoading(false)
    }
  }, [])

  const clockOut = useCallback(async () => {
    if (!session) return
    if (clockInFlightRef.current) return

    const snapshot = session
    setSession(null)
    setLoading(true)

    try {
      if (navigator.onLine) {
        const res = await fetch(`/api/clock/${snapshot.id}`, { method: 'PUT' })
        if (!res.ok) {
          toast.error('Erro ao registrar saída')
          setSession(snapshot)
          return
        }
        toast.success('Saída registrada!')
      } else {
        const timestamp = new Date().toISOString()
        await addPendingEntry({
          id: crypto.randomUUID(),
          entryId: snapshot.id,
          type: 'clock_out',
          timestamp,
          createdAt: timestamp,
        })
        toast.warning('Saída salva offline. Será sincronizada ao reconectar.')
      }
    } catch {
      toast.error('Erro ao registrar saída')
      setSession(snapshot)
    } finally {
      setLoading(false)
    }
  }, [session])

  return { session, setSession, clockIn, clockOut, loading }
}
```

- [ ] **Step 2: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-clock.ts
git commit -m "perf: optimistic clock-out — clear session immediately before API confirms"
```

---

## Task 4: Week Start Day — Type and Prisma Schema

**Files:**
- Modify: `src/lib/preferences.ts`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `WeekStartDay` to `preferences.ts`**

Add these two exports at the end of `src/lib/preferences.ts` (before the closing of the file, after `isDensityPreset`):

```ts
export const WEEK_START_DAYS = {
  monday: 'Segunda-feira',
  sunday: 'Domingo',
} as const

export type WeekStartDay = keyof typeof WEEK_START_DAYS

export function isWeekStartDay(value: unknown): value is WeekStartDay {
  return typeof value === 'string' && Object.hasOwn(WEEK_START_DAYS, value)
}
```

- [ ] **Step 2: Add `weekStartDay` field to `prisma/schema.prisma`**

In the `UserSettings` model, after the `themeMode` line and before `createdAt`:

```prisma
weekStartDay          String   @default("monday") @map("week_start_day")
```

The `UserSettings` model should now look like:

```prisma
model UserSettings {
  id                    String   @id @default(uuid())
  userId                String   @unique @map("user_id")
  workMinutesByWeekday  Json     @map("work_minutes_by_weekday")
  workScheduleTemplate  String   @default("standard_40h") @map("work_schedule_template")
  showCumulativeBalance Boolean  @default(false) @map("show_cumulative_balance")
  cumulativeBalanceScope String  @default("since_start") @map("cumulative_balance_scope")
  cumulativeStartDate   DateTime @map("cumulative_start_date") @db.Date
  accentPreset          String   @default("indigo") @map("accent_preset")
  themeMode             String   @default("system") @map("theme_mode")
  weekStartDay          String   @default("monday") @map("week_start_day")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_settings")
}
```

- [ ] **Step 3: Run Prisma migration**

```
npx prisma migrate dev --name add_week_start_day
```

Expected: migration file created, database updated, no errors.

- [ ] **Step 4: Regenerate Prisma client**

```
npx prisma generate
```

Expected: `@prisma/client` updated, no errors.

- [ ] **Step 5: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/preferences.ts prisma/schema.prisma prisma/migrations/
git commit -m "feat: add WeekStartDay type and weekStartDay Prisma field"
```

---

## Task 5: Week Start Day — User Settings Serialization

**Files:**
- Modify: `src/lib/user-settings.ts`
- Modify: `src/lib/__tests__/user-settings.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/user-settings.test.ts` at the end of the `describe('parseSettingsPatch', ...)` block:

```ts
  it('accepts valid weekStartDay values', () => {
    expect(parseSettingsPatch({ weekStartDay: 'monday' })).toMatchObject({ weekStartDay: 'monday' })
    expect(parseSettingsPatch({ weekStartDay: 'sunday' })).toMatchObject({ weekStartDay: 'sunday' })
  })

  it('rejects invalid weekStartDay values', () => {
    expect(parseSettingsPatch({ weekStartDay: 'saturday' })).toBe('Dia de início de semana inválido')
    expect(parseSettingsPatch({ weekStartDay: 42 })).toBe('Dia de início de semana inválido')
  })
```

- [ ] **Step 2: Run test to confirm it fails**

```
npx vitest run src/lib/__tests__/user-settings.test.ts
```

Expected: FAIL — `parseSettingsPatch` doesn't handle `weekStartDay` yet.

- [ ] **Step 3: Update `src/lib/user-settings.ts`**

Add `WeekStartDay` and `isWeekStartDay` to the import from `@/lib/preferences`:

```ts
import {
  ACCENT_PRESETS,
  CUMULATIVE_BALANCE_SCOPES,
  DEFAULT_WORK_MINUTES_BY_WEEKDAY,
  THEME_MODES,
  WORK_SCHEDULE_TEMPLATES,
  detectWorkScheduleTemplate,
  isAccentPreset,
  isCumulativeBalanceScope,
  isThemeMode,
  isWeekStartDay,
  isWorkScheduleTemplate,
  normalizeWorkMinutesByWeekday,
  type AccentPreset,
  type CumulativeBalanceScope,
  type ThemeMode,
  type WeekStartDay,
  type WorkMinutesByWeekday,
  type WorkScheduleTemplate,
} from '@/lib/preferences'
```

Add `weekStartDay` to `SerializedUserSettings`:

```ts
export interface SerializedUserSettings {
  workMinutesByWeekday: WorkMinutesByWeekday
  workScheduleTemplate: WorkScheduleTemplate
  showCumulativeBalance: boolean
  cumulativeBalanceScope: CumulativeBalanceScope
  cumulativeStartDate: string
  accentPreset: AccentPreset
  themeMode: ThemeMode
  weekStartDay: WeekStartDay
}
```

Add `weekStartDay` to `SettingsPatch`:

```ts
export interface SettingsPatch {
  workMinutesByWeekday?: WorkMinutesByWeekday
  workScheduleTemplate?: WorkScheduleTemplate
  showCumulativeBalance?: boolean
  cumulativeBalanceScope?: CumulativeBalanceScope
  cumulativeStartDate?: string
  accentPreset?: AccentPreset
  themeMode?: ThemeMode
  weekStartDay?: WeekStartDay
}
```

Update the private `serialize` function — add this line after the `themeMode` line:

```ts
const weekStartDay = isWeekStartDay(settings.weekStartDay) ? settings.weekStartDay : 'monday'
```

And add `weekStartDay` to the returned object:

```ts
return {
  workMinutesByWeekday: minutes,
  workScheduleTemplate: template,
  showCumulativeBalance: settings.showCumulativeBalance,
  cumulativeBalanceScope: scope,
  cumulativeStartDate: settings.cumulativeStartDate.toISOString().slice(0, 10),
  accentPreset,
  themeMode,
  weekStartDay,
}
```

Add validation to `parseSettingsPatch` — after the `if ('themeMode' in value)` block:

```ts
  if ('weekStartDay' in value) {
    if (!isWeekStartDay(value.weekStartDay)) return 'Dia de início de semana inválido'
    patch.weekStartDay = value.weekStartDay
  }
```

Add `weekStartDay` to `updateUserSettings` — in the `data` object spread:

```ts
...(patch.weekStartDay ? { weekStartDay: patch.weekStartDay } : {}),
```

- [ ] **Step 4: Run the failing test to confirm it now passes**

```
npx vitest run src/lib/__tests__/user-settings.test.ts
```

Expected: all tests pass including the new `weekStartDay` tests.

- [ ] **Step 5: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/user-settings.ts src/lib/__tests__/user-settings.test.ts
git commit -m "feat: add weekStartDay to user settings serialization and patch validation"
```

---

## Task 6: Parameterize `getWeekRangesForMonth`

**Files:**
- Modify: `src/lib/dates.ts`
- Modify: `src/lib/__tests__/dates.test.ts`

### The formula

`getWeekRangesForMonth` currently uses `6 - ((day + 6) % 7)` to find the number of days until the end of the Monday-starting week (Sunday). For a Sunday-starting week, the last day is Saturday: `6 - dayOfWeek` (where dayOfWeek is 0=Sun, 6=Sat).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/__tests__/dates.test.ts` a new `describe` block at the end:

```ts
import { getWeekRangesForMonth } from '../dates'

describe('getWeekRangesForMonth', () => {
  it('Monday start: May 2026 first week runs Mon May 4 – Sun May 10', () => {
    const ranges = getWeekRangesForMonth('2026-05', 1)
    expect(ranges[0]).toEqual({ startDate: '2026-05-01', endDate: '2026-05-03' })
    expect(ranges[1]).toEqual({ startDate: '2026-05-04', endDate: '2026-05-10' })
    expect(ranges[ranges.length - 1]).toEqual({ startDate: '2026-05-25', endDate: '2026-05-31' })
  })

  it('Sunday start: May 2026 first week runs Sun May 3 – Sat May 9', () => {
    const ranges = getWeekRangesForMonth('2026-05', 0)
    expect(ranges[0]).toEqual({ startDate: '2026-05-01', endDate: '2026-05-02' })
    expect(ranges[1]).toEqual({ startDate: '2026-05-03', endDate: '2026-05-09' })
    expect(ranges[ranges.length - 1]).toEqual({ startDate: '2026-05-31', endDate: '2026-05-31' })
  })

  it('Sunday start: February 2026 has correct week boundaries (month starts Sunday)', () => {
    // Feb 1 2026 is a Sunday — first "week" should start on Feb 1
    const ranges = getWeekRangesForMonth('2026-02', 0)
    expect(ranges[0]).toEqual({ startDate: '2026-02-01', endDate: '2026-02-07' })
    expect(ranges[ranges.length - 1].endDate).toBe('2026-02-28')
  })

  it('default (no second arg) preserves Monday-start behavior', () => {
    const withDefault = getWeekRangesForMonth('2026-05')
    const withMonday = getWeekRangesForMonth('2026-05', 1)
    expect(withDefault).toEqual(withMonday)
  })
})
```

Note: `getWeekRangesForMonth` is not currently exported with the import at the top of `dates.test.ts`. You must add it to the import:

```ts
import {
  formatBRT,
  getLocalDate,
  getWorkingDays,
  calcDurationMinutes,
  calculateExpectedMinutes,
  formatMinutes,
  getBrazilNationalHolidays,
  splitIntervalByLocalDay,
  getWeekRangesForMonth,
} from '../dates'
```

- [ ] **Step 2: Run test to confirm it fails**

```
npx vitest run src/lib/__tests__/dates.test.ts
```

Expected: FAIL — `getWeekRangesForMonth` doesn't accept a second argument yet, Sunday-start test cases fail.

- [ ] **Step 3: Update `getWeekRangesForMonth` in `src/lib/dates.ts`**

Replace the existing function (lines 225–240):

```ts
export function getWeekRangesForMonth(month: string, weekStartDay: 0 | 1 = 1): Array<{ startDate: string; endDate: string }> {
  const { startDate, endDate } = getMonthRangeBRT(month)
  const ranges: Array<{ startDate: string; endDate: string }> = []
  let cursor = startDate

  while (cursor <= endDate) {
    const day = getDayOfWeek(cursor)
    const daysUntilWeekEnd = weekStartDay === 1
      ? 6 - ((day + 6) % 7)  // Monday start → Sunday end
      : 6 - day               // Sunday start → Saturday end
    const rawEnd = addDaysToDateString(cursor, daysUntilWeekEnd)
    const rangeEnd = rawEnd > endDate ? endDate : rawEnd
    ranges.push({ startDate: cursor, endDate: rangeEnd })
    cursor = addDaysToDateString(rangeEnd, 1)
  }

  return ranges
}
```

- [ ] **Step 4: Run the dates tests**

```
npx vitest run src/lib/__tests__/dates.test.ts
```

Expected: all tests pass including the new Sunday-start cases.

- [ ] **Step 5: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dates.ts src/lib/__tests__/dates.test.ts
git commit -m "feat: parameterize getWeekRangesForMonth with weekStartDay (0=Sun, 1=Mon)"
```

---

## Task 7: Wire `weekStartDay` Through `hour-bank.ts`

**Files:**
- Modify: `src/lib/hour-bank.ts`

- [ ] **Step 1: Update `buildHourBankMonth` to pass `weekStartDay` to `getWeekRangesForMonth`**

In `src/lib/hour-bank.ts`, find the line (around line 197):

```ts
const weeks = getWeekRangesForMonth(month).map((range) =>
```

Replace it with:

```ts
const weekStartDay = settings.weekStartDay === 'sunday' ? 0 : 1
const weeks = getWeekRangesForMonth(month, weekStartDay).map((range) =>
```

The `settings` variable is always resolved before this line (either from `options.settings` or from `getOrCreateUserSettings(userId)` on line 184), so `settings.weekStartDay` is always available.

- [ ] **Step 2: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hour-bank.ts
git commit -m "feat: pass weekStartDay from user settings to week range calculation"
```

---

## Task 8: Week Start Day UI in Settings Page

**Files:**
- Modify: `src/app/configuracoes/configuracoes-client.tsx`

### What to add

A segmented control (two radio-style buttons: "Segunda-feira" | "Domingo") that updates `settings.weekStartDay` in local state. It saves with the rest of the settings when the user clicks "Salvar".

- [ ] **Step 1: Add `WEEK_START_DAYS` and `WeekStartDay` to the preferences import**

In `src/app/configuracoes/configuracoes-client.tsx`, find the existing import from `@/lib/preferences` and add:

```ts
  WEEK_START_DAYS,
  type WeekStartDay,
```

The updated import block:

```ts
import {
  WEEKDAY_KEYS,
  WEEK_START_DAYS,
  WORK_SCHEDULE_TEMPLATES,
  ARCHITECTURAL_PRESETS,
  DENSITY_PRESETS,
  type AccentPreset,
  type ArchitecturalPreset,
  type DensityPreset,
  type CumulativeBalanceScope,
  type ThemeMode,
  type WeekStartDay,
  type WorkMinutesByWeekday,
  type WorkScheduleTemplate,
} from '@/lib/preferences'
```

- [ ] **Step 2: Add the week start day card to the JSX**

In the JSX returned by `ConfiguracoesClient`, find the `<Card>` for "Jornada prevista" (it starts with `<CardTitle className="text-base">Jornada prevista</CardTitle>`). Add a new card **after** the closing `</Card>` of the "Jornada prevista" section and **before** the `<Card>` for "Banco de horas":

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">Semana</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-1">
      <Label>Início da semana</Label>
      <div className="flex gap-2 mt-1">
        {(Object.entries(WEEK_START_DAYS) as [WeekStartDay, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSettings((current) => ({ ...current, weekStartDay: key }))}
            className={[
              'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
              settings.weekStartDay === key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-accent',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 3: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/configuracoes/configuracoes-client.tsx
git commit -m "feat: add week start day selector to settings page"
```

---

## Task 9: Push Branch and Open PR

- [ ] **Step 1: Confirm all tests pass**

```
npx vitest run
```

Expected: all tests pass (should be 90+ tests).

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/post-merge-fixes
```

- [ ] **Step 3: Create the PR**

```bash
gh pr create \
  --title "fix/feat: keyboard nav latency, optimistic clock, week start day" \
  --body "$(cat <<'EOF'
## Summary
- **Keyboard shortcuts**: wrap `router.push` in `startTransition` + prefetch all routes on mount — eliminates the 5–10 s delay users perceived as broken shortcuts
- **Optimistic clock-in/out**: session state updates immediately before API call; rolls back with error toast on failure — eliminates ~1 s wait after clicking the clock button
- **Week start day**: user preference (`monday` / `sunday`) stored in DB, flows through settings → hour bank → week range calculation; new segmented control in settings page

## Test plan
- [ ] Press H/P/J/C keyboard shortcuts — page switches instantly (no more 5–10 s delay)
- [ ] Clock in — "clocked in" UI appears immediately; check DB confirms entry created
- [ ] Clock out — clock stops immediately; check DB confirms clock_out recorded
- [ ] Switch week start to Domingo in settings, save; check historico page shows Sun–Sat week rows
- [ ] All 90+ automated tests pass: `npx vitest run`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task covering it |
|---|---|
| Keyboard shortcuts: `startTransition` + `prefetch` | Task 1 |
| Optimistic clock-in with rollback | Task 2 |
| Optimistic clock-out with rollback | Task 3 |
| Guard clock-out while clock-in in flight | Task 3 (`clockInFlightRef.current` check) |
| `WeekStartDay` type + `WEEK_START_DAYS` constant | Task 4 |
| Prisma schema `weekStartDay` field | Task 4 |
| `SerializedUserSettings.weekStartDay` | Task 5 |
| `SettingsPatch.weekStartDay` + validation | Task 5 |
| `getWeekRangesForMonth` parameterized | Task 6 |
| Sunday-start tests | Task 6 |
| `hour-bank.ts` passes `weekStartDay` | Task 7 |
| Settings UI for week start day | Task 8 |

**Placeholder scan:** None found — all tasks have complete code.

**Type consistency check:**
- `WeekStartDay` defined in Task 4 (`preferences.ts`), imported in Task 5 (`user-settings.ts`) and Task 8 (`configuracoes-client.tsx`) ✓
- `weekStartDay: 0 | 1` parameter in `getWeekRangesForMonth` (Task 6) matches usage in `hour-bank.ts` (Task 7): `settings.weekStartDay === 'sunday' ? 0 : 1` ✓
- `isWeekStartDay` defined in Task 4, imported in Task 5 ✓
- `clockInFlightRef.current` set/read in same function in Task 2/3 ✓
