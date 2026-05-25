# Post-Merge Fixes & Week Start Day Feature

**Date:** 2026-05-24  
**Status:** Approved

---

## Problem Statement

After merging PR #6 (Phase 3-C), three issues were reported:

1. **Keyboard shortcuts feel broken** — pressing a shortcut updates the URL immediately but the page takes 5–10 seconds to actually render. Users perceive this as the shortcut not working.
2. **Performance is unacceptably slow** — clock-in/out and settings save wait for the API round-trip (~800–1500 ms) before any UI feedback, making the app feel sluggish.
3. **No week start day preference** — the timesheet week view hardcodes Monday as the first day. Users in Sunday-start locales have no way to change this.

---

## 1. Keyboard Navigation Latency

### Root Cause

`useKeyboardShortcuts` calls `router.push()` directly inside a DOM event listener. In Next.js App Router, `router.push()` outside a React transition triggers a **full RSC payload fetch** that blocks rendering. The UI update is deferred until the fetch completes (~5–10 s on cold nav).

### Solution

Wrap all `router.push()` calls in `startTransition()` (from `useTransition`) so React treats the navigation as a non-urgent update and keeps the current page interactive while the new page loads. Also call `router.prefetch()` on mount for all shortcut routes so the RSC payloads are cached before the user presses any key.

**Changes:**
- `src/hooks/use-keyboard-shortcuts.ts`: import `useTransition` from React; add `startTransition` wrapper around all `router.push()` calls; add `router.prefetch()` calls in `useEffect` on mount.

---

## 2. Optimistic UI for Clock & Settings

### Clock-In / Clock-Out

**Current flow:** user clicks → loading state → API call (800–1500 ms) → session state updated → toast shown.

**New flow (optimistic):**
- **Clock-in**: immediately set an optimistic session (`{ id: crypto.randomUUID(), projectId, projectName, projectColor, startTime: new Date(), isOptimistic: true }`) and show the clock running. On API success, replace the temp ID with the real ID. On failure, roll back to `null` and show an error toast.
- **Clock-out**: immediately set `session = null`. On failure, roll back to the saved snapshot and show an error toast.
- **Guard**: block a clock-out action while `session.isOptimistic === true` (clock-in is still in flight) to avoid a race where the real ID is unknown.

**Changes:** `src/hooks/use-clock.ts`

### Settings Save

**Current flow:** user clicks Save → loading spinner → API call → "Salvo!" toast.

**New flow:** show an immediate success toast, fire the API call in background, roll back with an error toast if it fails. Keep the loading indicator to signal background activity, but don't block the UI.

**Changes:** `src/app/configuracoes/configuracoes-client.tsx`

---

## 3. Week Start Day Preference

### Data Model

Add `weekStartDay` to `UserSettings` in Prisma:

```prisma
weekStartDay String @default("monday") @map("week_start_day")
```

Valid values: `"monday"` | `"sunday"`. Default: `"monday"` (preserves existing behavior).

### Shared Types

Add to `src/lib/preferences.ts`:
```ts
export const WEEK_START_DAYS = { monday: 'Segunda-feira', sunday: 'Domingo' } as const
export type WeekStartDay = keyof typeof WEEK_START_DAYS
```

### Date Calculation

`getWeekRangesForMonth` in `src/lib/dates.ts` currently hardcodes Monday-start logic. Parameterize it:

```ts
export function getWeekRangesForMonth(month: Date, weekStartDay: 0 | 1 = 1): DateRange[]
// weekStartDay: 0 = Sunday, 1 = Monday
```

The `daysUntilEndOfWeek` helper becomes:
```ts
function daysUntilEndOfWeek(dayOfWeek: number, weekStartDay: 0 | 1): number {
  return weekStartDay === 1
    ? 6 - ((dayOfWeek + 6) % 7)  // Monday start → Sunday end
    : 6 - dayOfWeek               // Sunday start → Saturday end
}
```

Also audit `getWeekRangeBRT` in the same file for any hardcoded day assumptions.

### Data Flow

`weekStartDay` flows from `SerializedUserSettings` → page-level RSC → `buildHistoryBundle` → `getWeekRangesForMonth`. All callers that currently pass no `weekStartDay` will receive the default Monday behavior, so existing tests pass unchanged. New tests cover the Sunday-start edge cases.

**Changes:**
- `prisma/schema.prisma` — add field
- `src/lib/preferences.ts` — add type & constant
- `src/lib/user-settings.ts` — add `weekStartDay` to `SerializedUserSettings` and `SettingsPatch`; update `serialize()` and `parseSettingsPatch()`
- `src/lib/dates.ts` — parameterize `getWeekRangesForMonth`
- `src/lib/hour-bank.ts` — pass `weekStartDay` from settings
- `src/lib/history.ts` — pass `weekStartDay` in `buildHistoryBundle`
- `src/app/configuracoes/configuracoes-client.tsx` — add segmented control for week start day
- `src/lib/__tests__/dates.test.ts` — add Sunday-start test cases

---

## 4. Error Handling

- All optimistic updates have rollback paths that surface an error toast in Portuguese.
- The clock-out guard prevents undefined IDs from reaching the API.
- Settings rollback restores the previous value in both local state and the server (or at minimum shows the discrepancy to the user via toast).

---

## 5. Testing

- `getWeekRangesForMonth` unit tests: existing Monday-start cases + new Sunday-start cases (month boundary, leap year February).
- `use-clock.ts`: unit tests for optimistic clock-in rollback and clock-out guard.
- Existing 90 tests must continue to pass after every change.

---

## Implementation Order

1. Keyboard shortcuts (`use-keyboard-shortcuts.ts`) — smallest change, unblocks user perception immediately
2. Optimistic clock (`use-clock.ts`) — highest user-visible impact
3. Optimistic settings save (`configuracoes-client.tsx`) — low risk
4. Week start day (Prisma → preferences → dates → settings → UI) — additive feature, no regressions
