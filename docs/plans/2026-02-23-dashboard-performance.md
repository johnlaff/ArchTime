# Dashboard Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the perceived navigation freeze when opening the dashboard by enabling Cache Components (which adds Activity-based navigation — no re-render when switching tabs), caching the projects list with `use cache`, removing the summary query from the server's critical path, and pre-warming routes in the navbar.

**Architecture:** Four targeted changes. (0) Enable `cacheComponents: true` in next.config.ts — this activates PPR and Activity navigation so the dashboard component is preserved in memory when the user switches tabs (no re-mount). (1) Replace the projects Prisma query with a `use cache` async function (60 s TTL, keyed by userId automatically). (2) Remove `todayEntries` from the server `Promise.all`; `DashboardClient` fetches summary on mount with a skeleton — clock button is interactive immediately. (3) Call `router.prefetch()` eagerly on navbar mount.

**Tech Stack:** Next.js 16 `use cache` + `cacheLife` · `cacheComponents: true` · React `useEffect` / `useState` · Prisma 7 · TypeScript strict

**Important:** Do NOT run `git push` at any point — commits accumulate locally and will be pushed at the end of the session.

---

### Task 0: Enable Cache Components in next.config.ts

**Files:**
- Modify: `next.config.ts`

**Why:** `cacheComponents: true` enables two key features in Next.js 16:
1. **Activity navigation** — when the user navigates away from /dashboard, Next.js keeps it "hidden" (Activity mode) rather than unmounting it. Navigating back is instant — no re-fetch, no re-render.
2. **PPR (Partial Prerendering)** — routes prerender a static shell at build time; dynamic content streams in.

It also unlocks the `use cache` directive (Task 1) and `cacheLife` API.

**Step 1: Add `cacheComponents: true` to next.config.ts**

Current content of `next.config.ts`:
```ts
import withSerwist from '@serwist/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /* config options here */
}

export default withSerwist({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
})(nextConfig)
```

Change to:
```ts
import withSerwist from '@serwist/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default withSerwist({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
})(nextConfig)
```

**Step 2: Verify the build succeeds**

Run: `npm run build` from `C:\Users\John\Documents\ArchTime\pontoarq`

Expected: Build succeeds. With `cacheComponents: true`, pages that access dynamic/runtime data (like our dashboard which calls `supabase.auth.getUser()` via cookies) are automatically treated as fully dynamic — no prerendering attempted, no errors.

If you see `"Uncached data was accessed outside of <Suspense>"` errors, it means some other route in the app has a DB/network call not wrapped in Suspense. Report it — do not attempt to fix it here.

**Step 3: Commit**

```bash
git add next.config.ts
git commit -m "perf: enable cacheComponents for Activity navigation and PPR"
```

---

### Task 1: Cache the projects list with `use cache`

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Why:** The `projects` query scans all active projects for the user and runs on every dashboard navigation. Projects change only when the user creates, edits, or archives — rarely. A 60 s cache eliminates this DB round-trip on most loads. In Next.js 16, `use cache` is the correct API (`unstable_cache` is deprecated).

**Step 1: Add `cacheLife` import**

In `src/app/dashboard/page.tsx`, add to the existing `next/cache` import (or add the import if not present):

```ts
import { cacheLife } from 'next/cache'
```

**Step 2: Define a cached async function**

Add this function just above the `DashboardPage` export (after all imports). Note: `use cache` at the top of the function body is a directive — it must be a string literal on the first line of the function, like `'use server'`.

```ts
async function getCachedProjects(userId: string) {
  'use cache'
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  return prisma.project.findMany({
    where: { userId, isActive: true },
    orderBy: { name: 'asc' },
  })
}
```

Key points:
- The `userId` argument is automatically part of the cache key — no manual key array needed.
- `stale: 60` — serve cached data for up to 60 s without revalidating.
- `revalidate: 60` — after 60 s, revalidate in the background (stale-while-revalidate).
- `expire: 3600` — hard expiry after 1 hour.
- `prisma` is a module-level import (not a closure), so it's allowed inside `use cache`.

**Step 3: Replace the inline projects query in Promise.all**

Inside `DashboardPage`, find the third element of `Promise.all`:
```ts
prisma.project.findMany({
  where: { userId: user.id, isActive: true },
  orderBy: { name: 'asc' },
}),
```

Replace it with:
```ts
getCachedProjects(user.id),
```

The destructuring `const [activeEntry, todayEntries, projects] = await Promise.all([...])` and the other two queries remain untouched in this task.

**Step 4: Verify**

Run: `npm run build`
Expected: Build succeeds. TypeScript is happy — `getCachedProjects` returns `Promise<Project[]>` which is the same type as before.

**Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "perf: cache dashboard projects list 60s with use cache"
```

---

### Task 2: Move daily summary to client-side fetch

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/dashboard-client.tsx`

**Why:** `todayEntries` is the slowest query (scans today's entries by date). Moving it to a client-side `useEffect` removes it from the server critical path. The clock button becomes interactive as soon as `activeEntry` + cached projects resolve. The summary appears ~100–300 ms later with a skeleton.

**Step 1: Strip `todayEntries` from `page.tsx`**

In `src/app/dashboard/page.tsx`, make all of the following changes:

a) Remove the `getLocalDate` import — it's only used for the `today` variable:
```ts
// Remove this line:
import { getLocalDate } from '@/lib/dates'
```

b) Remove the `today` variable and the `todayEntries` query. Change `Promise.all` from:
```ts
const today = new Date(getLocalDate() + 'T00:00:00.000Z')

const [activeEntry, todayEntries, projects] = await Promise.all([
  prisma.clockEntry.findFirst({
    where: { userId: user.id, clockOut: null },
    include: {
      allocations: {
        include: { project: { select: { name: true, color: true } } },
        take: 1,
      },
    },
  }),
  prisma.clockEntry.findMany({
    where: { userId: user.id, entryDate: today, clockOut: { not: null } },
    include: {
      allocations: {
        include: { project: { select: { name: true, color: true } } },
        take: 1,
      },
    },
    orderBy: { clockIn: 'desc' },
    take: 5,
  }),
  getCachedProjects(user.id),
])
```

To (two queries instead of three):
```ts
const [activeEntry, projects] = await Promise.all([
  prisma.clockEntry.findFirst({
    where: { userId: user.id, clockOut: null },
    include: {
      allocations: {
        include: { project: { select: { name: true, color: true } } },
        take: 1,
      },
    },
  }),
  getCachedProjects(user.id),
])
```

c) Remove the entire `summary` computation block (these lines):
```ts
const summary: DailySummary = {
  totalMinutes: todayEntries.reduce((s, e) => s + (e.totalMinutes ?? 0), 0),
  sessionCount: todayEntries.length,
  entries: todayEntries.map(e => ({
    id: e.id,
    clockIn: e.clockIn.toISOString(),
    clockOut: e.clockOut?.toISOString() ?? null,
    totalMinutes: e.totalMinutes,
    projectName: e.allocations[0]?.project.name ?? null,
    projectColor: e.allocations[0]?.project.color ?? null,
  })),
}
```

d) Remove `DailySummary` from the type import and remove `initialSummary` from the JSX:

```ts
// Change:
import type { ActiveSession, DailySummary, ProjectOption } from '@/types'
// To:
import type { ActiveSession, ProjectOption } from '@/types'
```

```tsx
// Change the return from:
return (
  <DashboardClient
    initialSession={session}
    initialSummary={summary}
    projects={projectOptions}
  />
)

// To:
return (
  <DashboardClient
    initialSession={session}
    projects={projectOptions}
  />
)
```

**Step 2: Update `dashboard-client.tsx`**

In `src/app/dashboard/dashboard-client.tsx`, make all of the following changes:

a) Change the React import to include `useEffect`:
```ts
// Change:
import { useState } from 'react'
// To:
import { useState, useEffect } from 'react'
```

b) Remove `initialSummary` from the props interface:
```ts
// Change:
interface DashboardClientProps {
  initialSession: ActiveSession | null
  initialSummary: DailySummary
  projects: ProjectOption[]
}
// To:
interface DashboardClientProps {
  initialSession: ActiveSession | null
  projects: ProjectOption[]
}
```

c) Remove `initialSummary` from the destructured props and change `summary` state to start as `null`:
```ts
// Change:
export function DashboardClient({
  initialSession,
  initialSummary,
  projects,
}: DashboardClientProps) {
  // ...
  const [summary, setSummary] = useState(initialSummary)

// To:
export function DashboardClient({
  initialSession,
  projects,
}: DashboardClientProps) {
  // ...
  const [summary, setSummary] = useState<DailySummary | null>(null)
```

d) Add a `useEffect` to fetch the summary on mount. Place it right after all the `useState` declarations, before any functions:
```ts
useEffect(() => {
  fetch('/api/clock/summary')
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data) setSummary(data) })
}, [])
```

e) Update the `<DailySummaryCard>` render to show a pulse skeleton while summary is null:
```tsx
// Change:
<DailySummaryCard summary={summary} />

// To:
{summary === null ? (
  <div className="space-y-3">
    <div className="h-24 rounded-xl bg-muted/50 animate-pulse" />
  </div>
) : (
  <DailySummaryCard summary={summary} />
)}
```

f) Keep the `DailySummary` type import — it's still used for `useState<DailySummary | null>`:
```ts
import type { ActiveSession, DailySummary, ProjectOption } from '@/types'
```

**Step 3: Verify TypeScript**

Run: `npm run build`
Expected: Build succeeds. No unused imports. TypeScript strict mode passes.

**Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/dashboard/dashboard-client.tsx
git commit -m "perf: move daily summary to client-side fetch, clock button renders immediately"
```

---

### Task 3: Eagerly prefetch nav routes on navbar mount

**Files:**
- Modify: `src/components/navbar.tsx`

**Why:** Next.js `<Link>` prefetches routes when they enter the viewport. Since the navbar is sticky and always visible, this already fires — but only after initial paint. Calling `router.prefetch()` in a `useEffect` fires immediately on mount, before the user taps. Especially useful on mobile where hover events don't exist.

**Step 1: Add `useEffect` to the React import**

In `src/components/navbar.tsx`, the file already uses `'use client'`. Add `useEffect` to the import:

```ts
import { useEffect } from 'react'
```

**Step 2: Add prefetch calls inside `Navbar`**

Inside the `Navbar` function body, after the existing hook declarations (`usePathname`, `useTheme`, `useRouter`), add:

```ts
useEffect(() => {
  navItems.forEach(({ href }) => router.prefetch(href))
}, [router])
```

**Step 3: Verify**

Run: `npm run build`
Expected: Build succeeds, no TypeScript errors.

**Step 4: Commit**

```bash
git add src/components/navbar.tsx
git commit -m "perf: eagerly prefetch all nav routes on navbar mount"
```

---

## Summary of changes

| File | Change |
|------|--------|
| `next.config.ts` | Add `cacheComponents: true` — enables Activity navigation (no re-mount on tab switch) and PPR |
| `src/app/dashboard/page.tsx` | Use `use cache` + `cacheLife` for projects; remove `todayEntries`, `today`, `getLocalDate`, `summary` block, `initialSummary` prop |
| `src/app/dashboard/dashboard-client.tsx` | Remove `initialSummary` prop; `summary` starts as `null`; `useEffect` fetches on mount; skeleton while null |
| `src/components/navbar.tsx` | Add `useEffect` with `router.prefetch()` for all nav routes |

**Result:**
- Switching tabs no longer re-mounts the dashboard (Activity navigation)
- Dashboard critical path: 3 queries → 1 query (`activeEntry`) + 1 cached read (`projects`)
- Clock button is interactive immediately; summary streams in with skeleton
- Routes pre-warmed on navbar mount
