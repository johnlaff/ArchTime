# Design: Navigation Freeze Fix + /historico + Delete

**Date:** 2026-02-23
**Status:** Approved

## Problem

1. Navigating between pages (e.g. Projetos → Ponto) causes a 1-2s visual freeze because `dashboard/page.tsx` is a Server Component with 3 Prisma queries and no `loading.tsx` fallback. The page renders nothing until all queries resolve.

2. Users have no way to delete incorrect clock entries.

3. There is no history page to review past entries.

## Solution Overview

Three independent changes, delivered together:

1. **`loading.tsx` skeleton screens** — instant visual feedback on navigation
2. **`DELETE /api/clock/[id]`** — backend endpoint to remove an entry
3. **`/historico` page** — monthly history view with delete per entry

---

## 1. Navigation Freeze Fix

**Approach:** Add `loading.tsx` files using Next.js App Router's built-in loading UI convention. When the user clicks a nav link, the loading skeleton renders immediately while the Server Component fetches data.

**Files:**
- `src/app/dashboard/loading.tsx` — skeleton matching the dashboard layout (button placeholder, card placeholder, entry list placeholders)
- `src/app/projetos/loading.tsx` — skeleton matching the projects list layout
- `src/app/historico/loading.tsx` — skeleton matching the history layout (month nav + entry rows)

No changes to existing page or data-fetching logic.

---

## 2. DELETE /api/clock/[id]

**Approach:** Add a `DELETE` handler to the existing `src/app/api/clock/[id]/route.ts`.

**Logic:**
- Auth check (same pattern as existing `PUT`)
- Find entry by `id` and `userId` — return 404 if not found or not owned by user
- Reject if entry has `clockOut: null` (active session cannot be deleted — must clock out first)
- Delete in a Prisma transaction:
  1. `TimeAllocation.deleteMany({ where: { clockEntryId: id } })`
  2. `ClockEntry.delete({ where: { id } })`
  3. `AuditLog.create(...)` — action: `'delete_entry'`
- Return `204 No Content`

---

## 3. /historico Page

### API: GET /api/clock/history

New route: `src/app/api/clock/history/route.ts`

Query param: `?month=YYYY-MM` (defaults to current month if omitted)

Returns entries for the user in the given month, ordered by `clockIn` descending, with project info via `allocations`.

Response shape:
```ts
{
  entries: Array<{
    id: string
    clockIn: string       // ISO UTC
    clockOut: string | null
    totalMinutes: number | null
    projectName: string | null
    projectColor: string | null
  }>
  totalMinutes: number
  sessionCount: number
}
```

### Page: /historico

**Route:** `src/app/historico/page.tsx` (Server Component shell) + `src/app/historico/historico-client.tsx` (Client Component)

**Layout:**

```
← Fevereiro 2026 →

23 fev, domingo
  ● Residência Silva   09:00 — 12:30   3h 30m   [🗑]

22 fev, sábado
  09:15 — 17:00   7h 45m              [🗑]

─────────────────────────────
Total do mês: 47h 20m · 18 sessões
```

**Interactions:**
- `←` / `→` arrows navigate months, update URL param `?month=YYYY-MM`, re-fetch
- Delete icon opens an `AlertDialog` ("Tem certeza? Esta ação não pode ser desfeita.")
- On confirm: `DELETE /api/clock/{id}`, optimistically removes from list, shows toast
- Entries grouped by calendar day (using `entryDate`), sorted day descending, within day sorted `clockIn` descending
- Days with no entries are not shown
- Footer shows month total minutes and session count

**Navbar update:** Add "Histórico" nav item with `History` icon from lucide-react.

---

## Data Model Notes

- `ClockEntry.entryDate` — date-only field (UTC midnight) used for grouping by day
- `TimeAllocation` — cascade-deleted before the entry itself
- Active entries (`clockOut: null`) cannot be deleted

## Out of Scope

- Editing clock-in / clock-out times (deferred)
- Editing the project of an existing entry (deferred)
- Pagination (monthly view is bounded enough)
