# "ArchTime fluida" — Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every navigation and interaction feel instantaneous (imperceptible delay) within the current free-tier infra, by re-enabling prefetch, moving hot reads to client→Supabase-direct (BR→BR), making the dashboard/projetos pages static shells, and adding optimistic writes — measured on the Netlify Deploy Preview.

**Architecture:** Re-enable Next.js `<Link>` prefetch (the nav-freeze bug was the `removeChild` `<head>` conflict, already fixed in `e056358`, not prefetch). Convert `/dashboard` and `/projetos` from cold cross-region SSR (Prisma in `us-east-2` → Supabase in `sa-east-1`) into **static shells** whose data loads client-side: simple reads (active session, project list) go **directly to Supabase from the browser** (BR→BR, RLS-scoped), and the daily-summary aggregation loads from the existing `/api/clock/summary` route with a skeleton. Writes keep going through API routes (audit log + hash) but update the UI optimistically.

**Tech Stack:** Next.js 16.2.6 (App Router, `cacheComponents`), React 19.2.3, `@supabase/ssr` browser client, Prisma 7 (server only), Vitest + happy-dom + Testing Library, Playwright (measurement), Netlify (free tier).

---

## Pre-flight facts (verified against the live project, do not re-derive)

- **Branch:** `perf/fluid-archtime` (spec at `docs/superpowers/specs/2026-05-29-performance-fluid-archtime-design.md`, commit `7462254`). Git root is `pontoarq/`. Run all `npm`/`git` commands from `pontoarq/`.
- **Supabase project:** `shgpfvhkxczxwdsuhudf` (`sa-east-1`, ACTIVE). RLS is enabled on every data table with `authenticated`-role policies:
  - `projects` → SELECT `using (user_id = auth.uid()::text)`.
  - `clock_entries` → SELECT `using (user_id = auth.uid()::text AND deleted_at IS NULL)`.
  - `time_allocations` → SELECT `using (EXISTS (SELECT 1 FROM clock_entries ce WHERE ce.id = time_allocations.clock_entry_id AND ce.user_id = auth.uid()::text AND ce.deleted_at IS NULL))`.
  - FKs exist: `time_allocations.clock_entry_id → clock_entries.id` and `time_allocations.project_id → projects.id` ⇒ the PostgREST nested embed `clock_entries → time_allocations → projects` is legal and RLS-safe.
- **Auth gating:** `src/proxy.ts` redirects unauthenticated/disallowed users to `/login` for every route except `login`, `auth/callback`, static assets, `icons`, `api/icon`, `manifest.json`, `sw.js`, `favicon.ico`. So removing the server-side `redirect('/login')` from a page and making it a static shell is safe — the proxy gates the HTML. (Prefetch requests intentionally bypass the proxy via the `missing` matcher; that's fine because the static shell needs no auth and dynamic routes/APIs re-check auth themselves.)
- **DB column casing:** snake_case in Postgres (`client_name`, `hourly_rate`, `is_active`, `clock_in`, `clock_out`, `deleted_at`, `project_id`, `clock_entry_id`, `user_id`). The TS types in `src/types/index.ts` are camelCase — the client-data layer maps between them.
- **The browser client** (`src/lib/supabase/client.ts` → `createClient()`) reads the user's session from cookies and sends the user JWT, so it runs as role `authenticated` and `auth.uid()` resolves. No code change needed there.

## Deviations from the approved spec (intentional, with reasons)

1. **`/api/clock/summary` is NOT cached in v1.** Caching the route does not avoid the cold start (the function is still invoked every GET) — it only saves the warm aggregation — and it introduces a staleness trap because `DashboardClient` refetches the summary after every clock action and on sync. Leaving it uncached keeps that path always-correct. The static shell + client-direct session/projects already deliver "first paint of data doesn't wait on the cold function." If preview shows warm aggregation is the real bottleneck, summary caching becomes a separately-verified follow-up (would require revalidating a `summary-${userId}` tag in POST `/api/clock`, PUT+DELETE `/api/clock/[id]`, and POST `/api/sync`).
2. **Optimistic project CRUD covers archive + edit only; create stays await-then-insert.** Optimistic create needs temp-id reconciliation for a rare action; the cost/benefit isn't there. Documented in Task 8.
3. **Speculative themes (React Compiler, View Transitions, full LazyMotion) are gated on preview measurement.** They target client re-render / polish, not the measured bottlenecks (cold start + cross-region). They go last, each as its own commit that is dropped if it doesn't move INP/TTI or regresses anything (Tasks 11–13).

---

## File Structure

**New files**
- `src/lib/client-data.ts` — typed browser→Supabase reads: `fetchProjects(supabase, { activeOnly })`, `fetchActiveSession(supabase)`. Maps snake_case rows → camelCase `ProjectOption` / `ActiveSession`.
- `src/lib/__tests__/client-data.test.ts` — unit tests for the mappers using a stubbed Supabase query builder.
- `src/hooks/use-supabase-query.ts` — minimal stale-while-revalidate hook: module-level cache, in-flight dedup, revalidate on focus/online, `refetch`, `clearClientQueryCache`.
- `src/hooks/__tests__/use-supabase-query.test.ts` — unit tests for the hook.
- `scripts/perf/measure.mjs` + `scripts/perf/mint-session.mjs` — temporary Playwright measurement harness (removed before merge).

**Modified files**
- `src/components/sidebar-nav.tsx` — remove `prefetch={false}` + stale `#86182` comment.
- `src/components/navbar.tsx` — remove `prefetch={false}`; (Task 11, gated) dynamic-import the accent picker popover content.
- `src/lib/__tests__/review-feedback-source.test.ts` — rewrite the obsolete `#86182` test to enforce "prefetch stays enabled".
- `src/app/dashboard/page.tsx` — become a static shell (no SSR auth/data).
- `src/app/dashboard/dashboard-client.tsx` — fetch session/projects (Supabase-direct) + summary (API) client-side with skeletons; parallel reads; seed `useClock`.
- `src/app/projetos/page.tsx` — become a static shell.
- `src/app/projetos/projetos-client.tsx` — fetch projects client-side; optimistic archive + edit.
- `src/app/configuracoes/configuracoes-client.tsx` — drop `disabled={saving}` (non-blocking save with in-flight guard).
- `src/components/clock-button.tsx`, `src/components/daily-summary.tsx`, `src/components/current-session.tsx`, `src/components/accent-color-provider.tsx`, `src/components/providers.tsx` — (Task 12, gated) LazyMotion `m` conversion.
- `src/components/navbar.tsx`, `src/app/dashboard/dashboard-client.tsx` — (Task 11, gated) dynamic imports.
- `next.config.ts` — (Task 13, gated) `experimental.reactCompiler` and/or `experimental.viewTransition`.
- `package.json` — (Task 13, gated) `babel-plugin-react-compiler` devDependency.

**Sequencing (by confidence; speculative last):**
Task 1 prefetch → Task 2 client-data lib → Task 3 use-supabase-query hook → Task 4 dashboard shell → Task 5 projetos shell → Task 6 optimistic settings → Task 7 measurement harness + preview gate → Task 8 optimistic projetos CRUD → **[measure]** → Task 11 JS-trim safe half (gated) → Task 12 LazyMotion (gated) → Task 13 React Compiler / View Transitions (gated) → Task 14 finalize PR.

---

## Task 1: Re-enable `<Link>` prefetch + fix the obsolete regression test

**Files:**
- Modify: `src/components/sidebar-nav.tsx`
- Modify: `src/components/navbar.tsx`
- Test: `src/lib/__tests__/review-feedback-source.test.ts`

- [ ] **Step 1: Update the regression test to enforce the NEW invariant (prefetch stays on)**

In `src/lib/__tests__/review-feedback-source.test.ts`, replace the whole `it('does not force/eagerly prefetch nav routes …')` block (currently lines ~93–105) with:

```ts
  it('keeps default <Link> prefetch enabled on nav links (the page-swap freeze was the removeChild <head> conflict, fixed in layout.tsx — not prefetch)', () => {
    const providers = readSource('src/components/providers.tsx')
    const sidebarNav = readSource('src/components/sidebar-nav.tsx')
    const navbar = readSource('src/components/navbar.tsx')

    // Re-enabling default prefetch makes nav content ready on hover/viewport.
    // Do NOT re-add prefetch={false} (that was the #86182 misdiagnosis).
    expect(sidebarNav).not.toContain('prefetch={false}')
    expect(navbar).not.toContain('prefetch={false}')
    // But still no mount-time "prefetch every route" storm.
    expect(providers).not.toContain('useRoutePrefetch')
    expect(existsSync(join(process.cwd(), 'src/hooks/use-route-prefetch.ts'))).toBe(false)
  })
```

Leave the sibling test `it('uses plain router.push and avoids mount-time route prefetch storms', …)` (lines ~82–91) UNCHANGED — a mount-time `router.prefetch` storm in `use-keyboard-shortcuts` is a separate concern from `<Link>` prefetch, and that guard is still correct.

- [ ] **Step 2: Run the test — it must FAIL now (source still has `prefetch={false}`)**

Run: `npm test -- review-feedback-source`
Expected: FAIL on the new assertions (`sidebarNav` still contains `prefetch={false}`).

- [ ] **Step 3: Remove `prefetch={false}` and the stale comment from `sidebar-nav.tsx`**

Delete the stale comment block (currently lines 24–27):

```tsx
// Nav links set prefetch={false} on purpose — Next.js #86182: with cacheComponents,
// clicking a link while its prefetch RSC request is still in flight blocks navigation
// until the prefetch finishes (the URL changes but the UI stays frozen). loading.tsx
// renders an instant skeleton on click instead. Revisit when #86182 is fixed upstream.
```

And remove the `prefetch={false}` prop from the `<Link>` (currently line 39). The `<Link>` opening becomes:

```tsx
          <Link
            key={href}
            href={disabled ? '#' : href}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
            onClick={(e) => { if (disabled) e.preventDefault() }}
```

- [ ] **Step 4: Remove `prefetch={false}` from `navbar.tsx`**

The nav-link `<Link>` (currently lines 73–77) becomes:

```tsx
            <Link
              key={href}
              href={href}
            >
```

- [ ] **Step 5: Run tests — they must PASS**

Run: `npm test -- review-feedback-source`
Expected: PASS (all assertions, including the new prefetch ones).

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar-nav.tsx src/components/navbar.tsx src/lib/__tests__/review-feedback-source.test.ts
git commit -m "perf(nav): re-enable Link prefetch (freeze was removeChild, not prefetch)"
```

---

## Task 2: Client→Supabase-direct read layer (`client-data.ts`)

**Files:**
- Create: `src/lib/client-data.ts`
- Test: `src/lib/__tests__/client-data.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/client-data.test.ts`. The tests stub a minimal Supabase query builder (chainable, resolves to `{ data, error }`) and assert the snake_case→camelCase mapping.

```ts
import { describe, expect, it, vi } from 'vitest'
import { fetchActiveSession, fetchProjects } from '@/lib/client-data'

/** Builds a chainable stub whose terminal `await` resolves to `result`. */
function stubClient(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'order', 'limit']) {
    builder[m] = vi.fn(() => builder)
  }
  // The query is awaited directly (PostgREST builders are thenable).
  ;(builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve)
  const from = vi.fn(() => builder)
  return { from } as never
}

describe('fetchProjects', () => {
  it('maps snake_case rows to ProjectOption and coerces hourly_rate', async () => {
    const client = stubClient({
      data: [
        { id: 'p1', name: 'A', client_name: 'Cliente', color: '#111111', hourly_rate: '150.00', is_active: true },
        { id: 'p2', name: 'B', client_name: null, color: '#222222', hourly_rate: null, is_active: false },
      ],
      error: null,
    })
    const result = await fetchProjects(client, { activeOnly: false })
    expect(result).toEqual([
      { id: 'p1', name: 'A', clientName: 'Cliente', color: '#111111', hourlyRate: 150, isActive: true },
      { id: 'p2', name: 'B', clientName: null, color: '#222222', hourlyRate: null, isActive: false },
    ])
  })

  it('throws when Supabase returns an error', async () => {
    const client = stubClient({ data: null, error: { message: 'rls denied' } })
    await expect(fetchProjects(client, { activeOnly: true })).rejects.toThrow('rls denied')
  })
})

describe('fetchActiveSession', () => {
  it('maps a nested clock_entry + allocation + project to ActiveSession', async () => {
    const client = stubClient({
      data: [
        {
          id: 'e1',
          clock_in: '2026-05-29T12:00:00+00:00',
          time_allocations: [{ project_id: 'p1', projects: { name: 'A', color: '#111111' } }],
        },
      ],
      error: null,
    })
    const result = await fetchActiveSession(client)
    expect(result).toEqual({
      id: 'e1',
      clockIn: '2026-05-29T12:00:00.000Z',
      projectId: 'p1',
      projectName: 'A',
      projectColor: '#111111',
    })
  })

  it('returns null when there is no open entry', async () => {
    const client = stubClient({ data: [], error: null })
    expect(await fetchActiveSession(client)).toBeNull()
  })

  it('handles an open entry with no project allocation', async () => {
    const client = stubClient({
      data: [{ id: 'e2', clock_in: '2026-05-29T12:00:00+00:00', time_allocations: [] }],
      error: null,
    })
    const result = await fetchActiveSession(client)
    expect(result).toMatchObject({ id: 'e2', projectId: null, projectName: null, projectColor: null })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- client-data`
Expected: FAIL with "Cannot find module '@/lib/client-data'".

- [ ] **Step 3: Implement `src/lib/client-data.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveSession, ProjectOption } from '@/types'

type ProjectRow = {
  id: string
  name: string
  client_name: string | null
  color: string
  hourly_rate: string | number | null
  is_active: boolean
}

/**
 * Reads the user's projects directly from Supabase (BR→BR), scoped by RLS
 * (`projects_select_own`). `activeOnly` filters to `is_active = true` for the
 * dashboard project selector; pass `false` for the projetos management list.
 */
export async function fetchProjects(
  supabase: SupabaseClient,
  options: { activeOnly: boolean },
): Promise<ProjectOption[]> {
  let query = supabase
    .from('projects')
    .select('id, name, client_name, color, hourly_rate, is_active')
  if (options.activeOnly) query = query.eq('is_active', true)

  const { data, error } = await query
    .order('is_active', { ascending: false })
    .order('name')
  if (error) throw new Error(error.message)

  return (data as ProjectRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.client_name,
    color: p.color,
    hourlyRate: p.hourly_rate == null ? null : Number(p.hourly_rate),
    isActive: p.is_active,
  }))
}

type ActiveEntryRow = {
  id: string
  clock_in: string
  time_allocations: { project_id: string; projects: { name: string; color: string } | null }[]
}

/**
 * Reads the user's open clock entry directly from Supabase (BR→BR). RLS on
 * `clock_entries` (own + not deleted) and the nested `time_allocations`/`projects`
 * embeds (own via clock_entry) scope the result. Returns null when clocked out.
 */
export async function fetchActiveSession(
  supabase: SupabaseClient,
): Promise<ActiveSession | null> {
  const { data, error } = await supabase
    .from('clock_entries')
    .select('id, clock_in, time_allocations(project_id, projects(name, color))')
    .is('clock_out', null)
    .is('deleted_at', null)
    .order('clock_in', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)

  const row = (data as ActiveEntryRow[])[0]
  if (!row) return null

  const allocation = row.time_allocations[0]
  return {
    id: row.id,
    clockIn: new Date(row.clock_in).toISOString(),
    projectId: allocation?.project_id ?? null,
    projectName: allocation?.projects?.name ?? null,
    projectColor: allocation?.projects?.color ?? null,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- client-data`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/client-data.ts src/lib/__tests__/client-data.test.ts
git commit -m "perf(data): add client->Supabase-direct read layer (projects, active session)"
```

---

## Task 3: `useSupabaseQuery` stale-while-revalidate hook

**Files:**
- Create: `src/hooks/use-supabase-query.ts`
- Test: `src/hooks/__tests__/use-supabase-query.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/use-supabase-query.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseQuery, clearClientQueryCache } from '@/hooks/use-supabase-query'

beforeEach(() => clearClientQueryCache())

describe('useSupabaseQuery', () => {
  it('loads data: loading true then resolves with data', async () => {
    const fetcher = vi.fn(async () => 42)
    const { result } = renderHook(() => useSupabaseQuery('k1', fetcher))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe(42)
    expect(result.current.error).toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('serves cached data instantly to a second hook with the same key (no loading flash)', async () => {
    const fetcher = vi.fn(async () => 'cached')
    const first = renderHook(() => useSupabaseQuery('k2', fetcher))
    await waitFor(() => expect(first.result.current.data).toBe('cached'))

    const second = renderHook(() => useSupabaseQuery('k2', fetcher))
    expect(second.result.current.loading).toBe(false)
    expect(second.result.current.data).toBe('cached')
  })

  it('dedupes concurrent fetches for the same key', async () => {
    const fetcher = vi.fn(async () => 'x')
    renderHook(() => useSupabaseQuery('k3', fetcher))
    renderHook(() => useSupabaseQuery('k3', fetcher))
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refetch triggers a fresh fetch', async () => {
    let n = 0
    const fetcher = vi.fn(async () => ++n)
    const { result } = renderHook(() => useSupabaseQuery('k4', fetcher))
    await waitFor(() => expect(result.current.data).toBe(1))

    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.data).toBe(2))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('captures fetch errors', async () => {
    const fetcher = vi.fn(async () => { throw new Error('boom') })
    const { result } = renderHook(() => useSupabaseQuery('k5', fetcher))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error?.message).toBe('boom')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- use-supabase-query`
Expected: FAIL with "Cannot find module '@/hooks/use-supabase-query'".

- [ ] **Step 3: Implement `src/hooks/use-supabase-query.ts`**

```ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface Entry<T> {
  data?: T
  error?: Error
  inflight?: Promise<T>
}

// Module-level cache: survives client navigations (instant revisits), cleared on
// logout via clearClientQueryCache() to avoid leaking one user's reads to another.
const store = new Map<string, Entry<unknown>>()

export function clearClientQueryCache(): void {
  store.clear()
}

export interface UseSupabaseQueryResult<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  refetch: () => void
}

/**
 * Minimal stale-while-revalidate reader (no extra dependency):
 * - returns cached data immediately on revisit (no skeleton flash),
 * - dedupes concurrent in-flight fetches by key,
 * - revalidates on window focus + reconnect (background, keeps data visible),
 * - `refetch()` forces a fresh read (use after a write to reconcile the cache).
 */
export function useSupabaseQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
): UseSupabaseQueryResult<T> {
  const cached = store.get(key) as Entry<T> | undefined
  const [data, setData] = useState<T | undefined>(cached?.data)
  const [error, setError] = useState<Error | undefined>(cached?.error)
  const [loading, setLoading] = useState<boolean>(cached?.data === undefined)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const mountedRef = useRef(true)

  const load = useCallback(() => {
    const entry = (store.get(key) as Entry<T> | undefined) ?? {}
    if (entry.data === undefined) setLoading(true) // skeleton only when nothing to show
    const promise = entry.inflight ?? fetcherRef.current()
    store.set(key, { ...entry, inflight: promise })

    promise.then(
      (result) => {
        store.set(key, { data: result })
        if (mountedRef.current) {
          setData(result)
          setError(undefined)
          setLoading(false)
        }
      },
      (err: unknown) => {
        const normalized = err instanceof Error ? err : new Error(String(err))
        const current = (store.get(key) as Entry<T> | undefined) ?? {}
        store.set(key, { ...current, inflight: undefined, error: normalized })
        if (mountedRef.current) {
          setError(normalized)
          setLoading(false)
        }
      },
    )
  }, [key])

  useEffect(() => {
    mountedRef.current = true
    load()
    const revalidate = () => {
      if (document.visibilityState !== 'hidden') load()
    }
    window.addEventListener('online', revalidate)
    window.addEventListener('focus', revalidate)
    return () => {
      mountedRef.current = false
      window.removeEventListener('online', revalidate)
      window.removeEventListener('focus', revalidate)
    }
  }, [load])

  const refetch = useCallback(() => {
    const entry = (store.get(key) as Entry<T> | undefined) ?? {}
    store.set(key, { ...entry, inflight: undefined }) // drop any stale in-flight handle
    load()
  }, [key, load])

  return { data, error, loading, refetch }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- use-supabase-query`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Wire `clearClientQueryCache()` into logout**

In `src/components/navbar.tsx`, import the helper and call it in `handleLogout` so a different user signing in on the same tab can't see cached reads.

Add to imports:

```tsx
import { clearClientQueryCache } from '@/hooks/use-supabase-query'
```

Update `handleLogout`:

```tsx
  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    clearClientQueryCache()
    router.push('/login')
  }
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (all prior tests + the 5 new hook tests + 5 client-data tests).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-supabase-query.ts src/hooks/__tests__/use-supabase-query.test.ts src/components/navbar.tsx
git commit -m "perf(data): add useSupabaseQuery (SWR cache, dedup, focus revalidate)"
```

---

## Task 4: Dashboard → static shell + client-direct reads (with CLS skeletons)

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/dashboard-client.tsx`
- Modify: `src/lib/__tests__/review-feedback-source.test.ts` (architecture guard)

**Why a child component:** rendering the interactive UI only after session+projects resolve (and `useClock` is seeded) avoids both a CLS jump and a "phantom session" flash on cached revisits. The summary loads independently and shows its own skeleton.

- [ ] **Step 1: Add an architecture guard test (page must not import server data)**

In `src/lib/__tests__/review-feedback-source.test.ts`, add this test inside the `describe('review feedback regressions', …)` block:

```ts
  it('keeps dashboard and projetos as static shells (no server-side prisma/auth in the page)', () => {
    const dashboard = readSource('src/app/dashboard/page.tsx')
    const projetos = readSource('src/app/projetos/page.tsx')

    for (const page of [dashboard, projetos]) {
      expect(page).not.toContain("from '@/lib/prisma'")
      expect(page).not.toContain('getCachedAuthenticatedUser')
      expect(page).not.toContain("'use cache'")
    }
  })
```

- [ ] **Step 2: Run it — must FAIL (pages still import prisma)**

Run: `npm test -- review-feedback-source`
Expected: FAIL (dashboard/projetos still import `@/lib/prisma`).

- [ ] **Step 3: Rewrite `src/app/dashboard/page.tsx` as a static shell**

Replace the ENTIRE file with:

```tsx
import { PageShell } from '@/components/page-shell'
import { DashboardClient } from './dashboard-client'

// Static shell: no SSR auth/data (proxy.ts gates this route). Session, projects
// and summary load client-side — session/projects go BR→BR direct to Supabase,
// the daily summary streams from /api/clock/summary with a skeleton.
export default function DashboardPage() {
  return (
    <PageShell>
      <DashboardClient />
    </PageShell>
  )
}
```

- [ ] **Step 4: Rewrite `src/app/dashboard/dashboard-client.tsx`**

Replace the ENTIRE file with:

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ClockButton } from '@/components/clock-button'
import { CurrentSession } from '@/components/current-session'
import { DailySummaryCard } from '@/components/daily-summary'
import { ProjectSelector } from '@/components/project-selector'
import { OfflineIndicator } from '@/components/offline-indicator'
import { OrphanSessionBanner } from '@/components/orphan-session-banner'
import { InstallPrompt } from '@/components/install-prompt'
import { useClock } from '@/hooks/use-clock'
import { useSupabaseQuery } from '@/hooks/use-supabase-query'
import { createClient } from '@/lib/supabase/client'
import { fetchActiveSession, fetchProjects } from '@/lib/client-data'
import { getLocalDateBRT } from '@/lib/dates'
import DashboardLoading from './loading'
import type { DailySummary } from '@/types'

async function fetchSummary(): Promise<DailySummary> {
  const res = await fetch('/api/clock/summary')
  if (!res.ok) throw new Error('Erro ao carregar resumo')
  return res.json() as Promise<DailySummary>
}

export function DashboardClient() {
  const supabase = useMemo(() => createClient(), [])

  const sessionQuery = useSupabaseQuery('dashboard:active-session', () => fetchActiveSession(supabase))
  const projectsQuery = useSupabaseQuery('dashboard:projects-active', () => fetchProjects(supabase, { activeOnly: true }))
  const summaryQuery = useSupabaseQuery('dashboard:summary', fetchSummary)

  const { session, setSession, clockIn, clockOut, loading } = useClock(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const seededRef = useRef(false)

  // Seed the optimistic clock state once from the first server read; after that,
  // clockIn/clockOut own the session locally. Revalidations update the cache only.
  useEffect(() => {
    if (!seededRef.current && !sessionQuery.loading) {
      seededRef.current = true
      setSession(sessionQuery.data ?? null)
      setSelectedProjectId(sessionQuery.data?.projectId ?? null)
    }
  }, [sessionQuery.loading, sessionQuery.data, setSession])

  useEffect(() => {
    const onSync = () => {
      sessionQuery.refetch()
      summaryQuery.refetch()
    }
    window.addEventListener('archtime:sync-complete', onSync)
    return () => window.removeEventListener('archtime:sync-complete', onSync)
  }, [sessionQuery, summaryQuery])

  async function handleClockIn() {
    await clockIn(selectedProjectId)
    sessionQuery.refetch()
    summaryQuery.refetch()
  }

  async function handleClockOut() {
    await clockOut()
    sessionQuery.refetch()
    summaryQuery.refetch()
  }

  // Show the full skeleton (matching final dimensions) until session+projects are
  // ready AND the clock state is seeded — holds CLS < 0.1 and avoids a session flash.
  const shellLoading = projectsQuery.loading || sessionQuery.loading || !seededRef.current
  if (shellLoading) return <DashboardLoading />

  const projects = projectsQuery.data ?? []
  const summary = summaryQuery.data ?? null
  const isOrphan = session && getLocalDateBRT(new Date(session.clockIn)) !== getLocalDateBRT()

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ponto</h1>
        <OfflineIndicator />
      </div>

      {isOrphan && session && (
        <OrphanSessionBanner
          session={session}
          onResolved={() => {
            setSession(null)
            sessionQuery.refetch()
            summaryQuery.refetch()
          }}
        />
      )}

      <AnimatePresence initial={false}>
        {session && !isOrphan && (
          <motion.div
            key="current-session"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <CurrentSession session={session} />
          </motion.div>
        )}
      </AnimatePresence>

      {!session && (
        <ProjectSelector
          projects={projects}
          value={selectedProjectId}
          onChange={setSelectedProjectId}
          disabled={loading}
        />
      )}

      <InstallPrompt />

      <ClockButton
        isClockedIn={!!session}
        onClick={session ? handleClockOut : handleClockIn}
        loading={loading}
      />

      {summary === null ? (
        <div className="space-y-3">
          <div className="h-24 rounded-xl bg-muted/50 animate-pulse" />
        </div>
      ) : (
        <DailySummaryCard summary={summary} />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run unit tests + typecheck via build's type step**

Run: `npm test -- review-feedback-source`
Expected: PASS (architecture guard now satisfied for dashboard; projetos guard still fails until Task 5 — so this step's expectation is that the dashboard assertions pass; the projetos lines will still fail). To avoid a red suite between tasks, run the dashboard guard narrowly:

Run: `npm test`
Expected: the new architecture-guard test FAILS only on the projetos page (dashboard portion satisfied). This is expected mid-sequence; it goes green at the end of Task 5. Do not "fix" it by reverting.

> If you prefer a green suite per task, split the guard test into a dashboard-only assertion here and add the projetos assertion in Task 5. Either is acceptable.

- [ ] **Step 6: Production build (catches RSC/static-shell + type errors)**

Run: `npm run build`
Expected: build succeeds; `/dashboard` is now listed as `○ (Static)` (was `◐`). If it still shows `◐`, confirm nothing in the page subtree awaits uncached server data.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/dashboard/dashboard-client.tsx src/lib/__tests__/review-feedback-source.test.ts
git commit -m "perf(dashboard): static shell + client-direct session/projects, summary with skeleton"
```

---

## Task 5: Projetos → static shell + client-direct reads

**Files:**
- Modify: `src/app/projetos/page.tsx`
- Modify: `src/app/projetos/projetos-client.tsx`

- [ ] **Step 1: Rewrite `src/app/projetos/page.tsx` as a static shell**

Replace the ENTIRE file with:

```tsx
import { PageShell } from '@/components/page-shell'
import { ProjetosClient } from './projetos-client'

// Static shell: no SSR auth/data (proxy.ts gates this route). The project list
// loads client-side, BR→BR direct from Supabase (RLS-scoped). Writes still go
// through /api/projects (audit log) and update the list optimistically.
export default function ProjetosPage() {
  return (
    <PageShell>
      <ProjetosClient />
    </PageShell>
  )
}
```

- [ ] **Step 2: Update `ProjetosClient` to fetch its own data**

In `src/app/projetos/projetos-client.tsx`:

Replace the imports block at the top (lines 1–12) with (adds `useEffect`, `useMemo`, `useRef`, the hook, the client, the fetcher, and the loading skeleton; drops the `initialProjects` prop dependency):

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Pencil, Archive, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSupabaseQuery } from '@/hooks/use-supabase-query'
import { createClient } from '@/lib/supabase/client'
import { fetchProjects } from '@/lib/client-data'
import ProjetosLoading from './loading'
import type { ProjectOption } from '@/types'
```

Change the component signature and add the data-loading/seed logic. Replace:

```tsx
export function ProjetosClient({ initialProjects }: { initialProjects: ProjectOption[] }) {
  const [projects, setProjects] = useState<ProjectOption[]>(initialProjects)
```

with:

```tsx
export function ProjetosClient() {
  const supabase = useMemo(() => createClient(), [])
  const query = useSupabaseQuery('projetos:all', () => fetchProjects(supabase, { activeOnly: false }))
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const seededRef = useRef(false)

  useEffect(() => {
    if (!seededRef.current && !query.loading) {
      seededRef.current = true
      setProjects(query.data ?? [])
    }
  }, [query.loading, query.data])
```

- [ ] **Step 3: Render the loading skeleton before seeding**

Immediately after the `function openCreate() {…}`/`openEdit`/handlers (i.e., right before the top-level `return (` of the component's JSX, around current line 171), add:

```tsx
  if (!seededRef.current) return <ProjetosLoading />
```

- [ ] **Step 4: Keep the cache fresh after writes**

In `handleSave`, `handleArchive`, and `handleDelete`, after the existing `setProjects(...)` success update, add `query.refetch()` so the module cache reflects server truth on the next visit. Example for `handleSave` (after `setProjects((current) => upsertProject(current, saved))`):

```tsx
      setProjects((current) => upsertProject(current, saved))
      query.refetch()
      toast.success(editingId ? 'Projeto atualizado' : 'Projeto criado')
```

Apply the same `query.refetch()` right after the `setProjects(...)` calls in `handleArchive` (after `upsertProject(current, updated)`) and `handleDelete` (after the `setProjects((current) => {…})` block).

- [ ] **Step 5: Run tests + build**

Run: `npm test`
Expected: PASS — the architecture-guard test from Task 4 (Step 1) now fully passes (both dashboard and projetos are shells).

Run: `npm run build`
Expected: build succeeds; `/projetos` now `○ (Static)`.

- [ ] **Step 6: Commit**

```bash
git add src/app/projetos/page.tsx src/app/projetos/projetos-client.tsx
git commit -m "perf(projetos): static shell + client-direct project list"
```

---

## Task 6: Optimistic settings save (drop the blocking disable)

**Files:**
- Modify: `src/app/configuracoes/configuracoes-client.tsx`

The page already applies every field change to local state instantly and `handleSave` already shows the success toast optimistically with snapshot rollback. The only blocking bit is `disabled={saving}`. Make the save non-blocking, with an in-flight ref to coalesce double-clicks.

- [ ] **Step 1: Replace the `saving` state with an in-flight ref**

Change (line 72):

```tsx
  const [saving, setSaving] = useState(false)
```

to:

```tsx
  const savingRef = useRef(false)
```

Add `useRef` to the React import (line 3):

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
```

- [ ] **Step 2: Rewrite `handleSave` to be non-blocking + coalesce double submits**

Replace the `handleSave` function (lines 149–162) with:

```tsx
  async function handleSave() {
    if (savingRef.current) return
    savingRef.current = true
    const snapshot = settings
    toast.success('Configurações salvas')
    try {
      const result = await saveSettings(settings)
      if ('error' in result) throw new Error(result.error)
    } catch (error) {
      setSettings(snapshot)
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar configurações')
    } finally {
      savingRef.current = false
    }
  }
```

- [ ] **Step 3: Make the Save button always interactive**

Replace the header Save button (lines 168–171):

```tsx
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
```

with:

```tsx
        <Button onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4" />
          Salvar
        </Button>
```

- [ ] **Step 4: Verify no remaining references to `saving`**

Run: `npm run build`
Expected: build succeeds with no "saving is not defined" / unused-var errors. (If `Save` icon import or others are now unused, the build/lint will flag them — they are still used.)

- [ ] **Step 5: Commit**

```bash
git add src/app/configuracoes/configuracoes-client.tsx
git commit -m "perf(configuracoes): non-blocking optimistic save"
```

---

## Task 7: Measurement harness (Tema 5) + capture baseline vs preview

**Files:**
- Create: `scripts/perf/mint-session.mjs`
- Create: `scripts/perf/measure.mjs`

These are **temporary** (mint a session from the service-role key) and are deleted in Task 14 before merge. They are outside `src/` so they never ship.

- [ ] **Step 1: Write the session-minting helper**

Create `scripts/perf/mint-session.mjs`. It uses the Supabase admin API to generate a magic link for the allowlisted email, verifies it to obtain a session, and serializes the auth cookies the `@supabase/ssr` server client expects. (Reuse the exact approach from the earlier nav-fix harness in this repo's history if present.)

```js
// Usage: node scripts/perf/mint-session.mjs > scripts/perf/.cookies.json
// Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEASURE_EMAIL from .env.local
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const env = {}
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
const email = env.MEASURE_EMAIL || env.ALLOWED_EMAILS?.split(',')[0]

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
if (error) throw error
const { properties } = data
const verify = await createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY).auth.verifyOtp({
  type: 'magiclink',
  token_hash: properties.hashed_token,
})
if (verify.error) throw verify.error
process.stdout.write(JSON.stringify(verify.data.session))
```

- [ ] **Step 2: Write the Playwright measurement script**

Create `scripts/perf/measure.mjs`. It takes a base URL, injects the session cookies, then measures: (a) **navigation content time** (click sidebar link → first non-skeleton content) for dashboard/historico/projetos/configuracoes, and (b) **INP-ish** interaction latency via the `event` timing / `PerformanceObserver`. It runs each path warm (second visit) and reports a JSON table.

```js
// Usage: node scripts/perf/measure.mjs <baseUrl>
// Requires scripts/perf/.cookies.json: a Playwright cookies array (see Step 2a).
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const baseUrl = process.argv[2]
if (!baseUrl) throw new Error('pass a base URL')
const cookies = JSON.parse(readFileSync('scripts/perf/.cookies.json', 'utf8'))

const browser = await chromium.launch()
const context = await browser.newContext()
// Re-target the captured cookies at the host under test.
const host = new URL(baseUrl).hostname
await context.addCookies(cookies.map((c) => ({ ...c, domain: host, url: undefined })))

const page = await context.newPage()
const routes = ['/dashboard', '/historico', '/projetos', '/configuracoes']
const results = {}

// Time from click to meaningful (non-skeleton) content. data-page-ready marks the
// shell; absence of .animate-pulse marks data filled in.
async function navTime(from, to) {
  await page.goto(baseUrl + from, { waitUntil: 'networkidle' })
  if (page.url().includes('/login')) throw new Error('not authenticated — refresh .cookies.json')
  const start = Date.now()
  await page.click(`a[href="${to}"]`)
  await page.waitForFunction(
    () => !!document.querySelector('[data-page-ready="true"]') && !document.querySelector('.animate-pulse'),
    { timeout: 15000 },
  ).catch(() => {})
  return Date.now() - start
}

for (let i = 0; i < routes.length; i++) {
  const from = routes[i]
  const to = routes[(i + 1) % routes.length]
  await navTime(from, to)                          // warm-up visit
  results[`${from} -> ${to}`] = await navTime(from, to)
}

console.log(JSON.stringify(results, null, 2))
await browser.close()
```

- [ ] **Step 2a: Produce `scripts/perf/.cookies.json` (authenticated cookies)**

The `@supabase/ssr` auth cookie name/encoding is version-specific and may be chunked, so capturing rather than hand-encoding is the reliable path. Either:
- **(preferred) Recover the prior harness** that already serialized a minted session into cookies — it existed for the nav-fix work and was deleted before that PR; find it in history: `git log --all --oneline --diff-filter=D -- 'scripts/**' '**/*nav*observe*'` then `git show <commit>:<path>` and adapt; or
- **(simplest) Capture from a real browser:** log into the preview manually, open DevTools → Application → Cookies, and export the `sb-*` cookie(s) as a Playwright cookies array `[{ name, value, path: '/' }]` into `scripts/perf/.cookies.json`. `mint-session.mjs` (Step 1) gives you the tokens if you prefer to assemble them programmatically.

Confirm success: `measure.mjs` throws "not authenticated" if any route redirects to `/login`.

- [ ] **Step 3: Capture the production baseline (pre-perf)**

Production still reflects the bug-fix-only state until this branch merges, so it is the baseline.

Run: `node scripts/perf/mint-session.mjs > scripts/perf/.cookies.json`
Run: `node scripts/perf/measure.mjs https://<production-url>`
Record the JSON under a "Baseline (production)" heading in the PR description draft.

- [ ] **Step 4: Push the branch and measure the preview**

```bash
git push -u origin perf/fluid-archtime
```

Wait for the Netlify Deploy Preview to finish (monitor the deploy; confirm the build has no errors). Then:

Run: `node scripts/perf/measure.mjs https://<deploy-preview-url>`
Record the JSON under "After high-confidence themes (preview)".

- [ ] **Step 5: Verify on the preview in an anonymous tab (PWA)**

Manually: open the preview in a private window, log in, and click through dashboard/historico/projetos/configuracoes. Confirm: 0 navigation freezes, content appears (not just skeleton) quickly when warm, dashboard renders instantly with session/projects then summary fills, no console `removeChild` error, no layout jump on the dashboard.

- [ ] **Step 6: Commit the harness (temporary)**

```bash
git add scripts/perf/mint-session.mjs scripts/perf/measure.mjs
git commit -m "test(perf): temporary Playwright measurement harness (removed before merge)"
```

Add `scripts/perf/.cookies.json` to a local ignore (do NOT commit it):

```bash
echo "scripts/perf/.cookies.json" >> .git/info/exclude
```

---

## Task 8: Optimistic project CRUD (archive + edit)

**Files:**
- Modify: `src/app/projetos/projetos-client.tsx`

Archive and edit are the high-value, low-risk optimistic wins (toggling/renaming should feel instant). Create stays await-then-insert (temp-id reconciliation isn't worth it for a rare action — documented deviation).

- [ ] **Step 1: Make `handleArchive` optimistic with rollback**

Replace `handleArchive` (lines 126–143) with:

```tsx
  async function handleArchive(project: ProjectOption) {
    const snapshot = projects
    // Optimistic: flip isActive immediately.
    setProjects((current) => upsertProject(current, { ...project, isActive: !project.isActive }))
    try {
      const res = await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id, isActive: !project.isActive }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Erro ao arquivar projeto')
      }
      const updated = normalizeProject(await res.json())
      setProjects((current) => upsertProject(current, updated))
      query.refetch()
      toast.success(project.isActive ? 'Projeto arquivado' : 'Projeto reativado')
    } catch (error) {
      setProjects(snapshot) // rollback
      toast.error(error instanceof Error ? error.message : 'Erro ao arquivar projeto')
    }
  }
```

- [ ] **Step 2: Make editing (existing project) optimistic in `handleSave`**

In `handleSave`, only the EDIT branch (when `editingId` is set) can update optimistically (we have the id + new values). Create stays as-is. Replace the body of `handleSave` from `setSaving(true)` (line 97) through the `catch/finally` with:

```tsx
    setSaving(true)
    const snapshot = projects
    const editing = editingId
    if (editing) {
      // Optimistic in-place update; close the dialog immediately.
      const optimistic: ProjectOption = {
        id: editing,
        name: form.name.trim(),
        clientName: form.clientName.trim() || null,
        color: form.color,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
        isActive: snapshot.find((p) => p.id === editing)?.isActive ?? true,
      }
      setProjects((current) => upsertProject(current, optimistic))
      setOpen(false)
    }
    try {
      const payload = {
        ...(editing ? { id: editing } : {}),
        name: form.name.trim(),
        clientName: form.clientName.trim() || null,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
        color: form.color,
      }
      const res = await fetch('/api/projects', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Erro ao salvar projeto')
      }
      const saved = normalizeProject(await res.json())
      setProjects((current) => upsertProject(current, saved))
      query.refetch()
      toast.success(editing ? 'Projeto atualizado' : 'Projeto criado')
      if (!editing) setOpen(false)
    } catch (error) {
      if (editing) setProjects(snapshot) // rollback the optimistic edit
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar projeto')
    } finally {
      setSaving(false)
    }
```

> Note: `query.refetch()` here requires Task 5 Step 4 already added it; if you applied Task 5 as written, this only adjusts surrounding logic. Keep a single `query.refetch()` per success path.

- [ ] **Step 3: Build + manual check on preview after push**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/app/projetos/projetos-client.tsx
git commit -m "perf(projetos): optimistic archive + edit with rollback"
```

- [ ] **Step 5: Push and re-measure**

```bash
git push
```

After the preview rebuilds, re-run `node scripts/perf/measure.mjs https://<deploy-preview-url>` and update the PR draft numbers. This is the **measurement gate**: the high-confidence set is now complete. Decide, from the numbers + manual feel, whether the speculative themes (Tasks 11–13) are warranted. If nav + dashboard already feel instantaneous and INP is < 200ms, you may stop here and go to Task 14.

---

## Task 11 (GATED): JS-trim safe half — dynamic-import non-critical components

**Gate:** Only do this if bundle/TTI is still worth trimming after measurement. Each step is independently revertible.

**Files:**
- Modify: `src/app/dashboard/dashboard-client.tsx`
- Modify: `src/components/navbar.tsx`

- [ ] **Step 1: Dynamic-import `InstallPrompt` (dashboard)**

In `dashboard-client.tsx`, replace the static import:

```tsx
import { InstallPrompt } from '@/components/install-prompt'
```

with a dynamic import (client-only, no SSR cost, not in the initial chunk):

```tsx
import dynamic from 'next/dynamic'
const InstallPrompt = dynamic(() => import('@/components/install-prompt').then((m) => m.InstallPrompt), { ssr: false })
```

- [ ] **Step 2: Dynamic-import the accent picker content in the navbar popover**

In `navbar.tsx`, replace:

```tsx
import { AccentColorPicker } from '@/components/accent-color-picker'
```

with:

```tsx
import dynamic from 'next/dynamic'
const AccentColorPicker = dynamic(() => import('@/components/accent-color-picker').then((m) => m.AccentColorPicker), { ssr: false })
```

(The picker only renders inside an opened `Popover`, so it loads on first open.)

- [ ] **Step 3: Build + verify the picker and install prompt still work on preview**

Run: `npm run build`
Expected: success; client bundle for the dashboard/navbar entry is smaller (note the delta from the build output).

- [ ] **Step 4: Commit (or revert if no measurable benefit)**

```bash
git add src/app/dashboard/dashboard-client.tsx src/components/navbar.tsx
git commit -m "perf(bundle): lazy-load install prompt + accent picker"
```

---

## Task 12 (GATED): LazyMotion `m` conversion

**Gate:** Only if measurement shows motion JS is a meaningful slice and repeat-visit caching (Serwist precache) isn't already absorbing it. Note: the sidebar nav-indicator uses `layoutId`, which requires the `domMax` feature set (not `domAnimation`), so the saving is modest. Do this LAST among bundle work.

**Files:**
- Modify: `src/components/providers.tsx`
- Modify: `src/components/sidebar-nav.tsx`, `src/components/clock-button.tsx`, `src/components/daily-summary.tsx`, `src/components/current-session.tsx`, `src/components/accent-color-provider.tsx`, `src/app/dashboard/dashboard-client.tsx`

- [ ] **Step 1: Wrap the app in `LazyMotion` (domMax, strict)**

In `providers.tsx`, replace the `MotionConfig` import and usage. Change import:

```tsx
import { MotionConfig } from 'motion/react'
```

to:

```tsx
import { MotionConfig, LazyMotion, domMax } from 'motion/react'
```

Wrap children (inside `MotionConfig`):

```tsx
      <MotionConfig reducedMotion="never">
        <LazyMotion features={domMax} strict>
          <SyncProvider>
            <PreferencesHydrator />
            {children}
            <Toaster richColors position="bottom-center" closeButton />
          </SyncProvider>
        </LazyMotion>
      </MotionConfig>
```

- [ ] **Step 2: Replace `motion` with `m` in each component**

In every component that imports `motion` from `motion/react`, switch to `m` (keep `AnimatePresence` as-is). Examples:

`sidebar-nav.tsx`, `daily-summary.tsx`, `current-session.tsx`: `import { m } from 'motion/react'` and `motion.span`/`motion.div` → `m.span`/`m.div`.

`dashboard-client.tsx`: `import { AnimatePresence, m } from 'motion/react'`; `motion.div` → `m.div`.

`clock-button.tsx`: `import { AnimatePresence, m } from 'motion/react'`; `const MotionButton = motion(Button)` → `const MotionButton = m.create(Button)`; `motion.span` → `m.span`.

`accent-color-provider.tsx`: switch any `motion.*` usage to `m.*`.

> `strict` mode makes any leftover `motion` (vs `m`) throw at runtime, so the test/preview pass will surface stragglers.

- [ ] **Step 3: Run tests + build + exercise EVERY animation on preview**

Run: `npm test && npm run build`
Expected: success. Then on the preview, verify: sidebar active-indicator slide (layoutId), clock button tap + in/out swap, daily-summary card stagger, current-session enter/exit, theme toggle, accent changes. Any broken animation = a missed `m` conversion or a feature not in `domMax` (it is).

- [ ] **Step 4: Commit (or revert if animations regress or no benefit)**

```bash
git add -A
git commit -m "perf(bundle): LazyMotion m-components (domMax)"
```

---

## Task 13 (GATED): React Compiler and/or View Transitions

**Gate:** Lowest priority. The measured bottlenecks are cold-start + cross-region data, not client re-renders, so expect little INP movement. Each is a single revertible commit and must NOT gate anything else.

### 13a — React Compiler

**Files:** `package.json`, `next.config.ts`

- [ ] **Step 1: Add the Babel plugin**

Run: `npm install -D babel-plugin-react-compiler`

- [ ] **Step 2: Enable it**

In `next.config.ts`, add to `experimental`:

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
    reactCompiler: true,
  },
}
```

- [ ] **Step 3: Build + full test + measure**

Run: `npm run build`
Expected: success. Watch for a large build-time increase (babel pass over `--webpack`) or Serwist interaction errors. If the build breaks or slows >2× with no INP benefit on preview, **revert this commit**.

Run: `npm test`
Expected: all 114+ tests pass.

- [ ] **Step 4: Commit (or revert)**

```bash
git add package.json package-lock.json next.config.ts
git commit -m "perf(runtime): enable React Compiler (revert if no INP gain)"
```

### 13b — View Transitions

**Files:** `next.config.ts` (+ minimal CSS)

- [ ] **Step 1: Enable the flag**

Add `viewTransition: true` to `experimental` in `next.config.ts`.

- [ ] **Step 2: Build + verify on preview it doesn't fight Framer layout animations**

Run: `npm run build`
Expected: success. On preview, confirm route changes cross-fade subtly and the sidebar `layoutId` indicator still animates without conflict. If it's janky or conflicts, **revert**.

- [ ] **Step 3: Commit (or revert)**

```bash
git add next.config.ts src/app/globals.css
git commit -m "perf(nav): subtle View Transitions (revert if conflicts)"
```

---

## Task 14: Finalize — remove harness, full verification, open the PR

**Files:** delete `scripts/perf/*`

- [ ] **Step 1: Delete the temporary measurement harness**

```bash
git rm scripts/perf/mint-session.mjs scripts/perf/measure.mjs
git rm -r --ignore-unmatch scripts/perf
git commit -m "test(perf): remove temporary measurement harness"
```

Confirm no other file imports anything under `scripts/perf/`.

- [ ] **Step 2: Full local verification**

Run: `npm test`
Expected: all tests pass (114 prior + new client-data/use-supabase-query/architecture-guard).

Run: `npm run build`
Expected: success; confirm `/dashboard` and `/projetos` are `○ (Static)` in the route table.

- [ ] **Step 3: Push and do the final preview verification**

```bash
git push
```

Monitor the Netlify Deploy Preview to a clean build. In an anonymous window: log in, click every nav link (twice each), clock in/out, edit/archive a project, save settings. Confirm: imperceptible nav, no freeze, no `removeChild`, dashboard data instant-then-summary, optimistic writes feel instant, no CLS jump. Note the React #419 rate (monitor only).

- [ ] **Step 4: Open the PR with the measurement table**

```bash
gh pr create --base main --head perf/fluid-archtime \
  --title "perf: ArchTime fluida — instant nav + client-direct reads + optimistic writes" \
  --body "$(cat <<'EOF'
## Summary
Make navigation and interactions feel instantaneous within free-tier infra.

- Re-enable `<Link>` prefetch (the freeze was the removeChild `<head>` conflict, fixed in e056358 — not prefetch).
- Dashboard + Projetos are now static shells; session/projects load BR→BR direct from Supabase (RLS-scoped), summary streams from `/api/clock/summary` with a skeleton — first paint no longer waits on the cold cross-region function.
- Optimistic writes: settings save (non-blocking), project archive + edit.
- (If kept) bundle trims / React Compiler / View Transitions — each gated on preview measurement.

## Deviations from spec
- `/api/clock/summary` left uncached in v1 (caching doesn't avoid cold start and adds a staleness trap to refreshSummary). Follow-up if warm aggregation proves to be the bottleneck.
- Optimistic create deferred (temp-id reconciliation not worth it for a rare action).

## Measurements (Playwright, warm nav, ms)
Baseline (production) vs preview:

<paste JSON tables>

## Verification
- `npm test` ✅  · `npm run build` ✅ (/dashboard, /projetos now Static)
- Preview anon tab: 0 freezes, no removeChild, instant nav, optimistic writes, CLS stable.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Present results to the user (PT-BR)** — share the before/after numbers, what shipped vs. what was dropped at the measurement gate, and the preview URL for them to test.

---

## Self-review notes (carried into execution)

- **CLS:** the dashboard skeleton (`DashboardLoading`) gates the whole interactive UI until session+projects+seed are ready; the summary card has its own matching skeleton. Keep skeleton block sizes aligned to final (`h-20` clock button, `h-24` summary).
- **Parallel reads:** the three `useSupabaseQuery` calls fire independently on mount — no waterfall.
- **Security:** writes still go through API routes (audit log + hash); reads rely on verified RLS SELECT policies; the proxy gates the static shells; the client cache is cleared on logout.
- **Type consistency:** `fetchProjects(supabase, { activeOnly })` and `fetchActiveSession(supabase)` are the only data entry points; `ProjectOption`/`ActiveSession` shapes match `src/types/index.ts`; `useSupabaseQuery<T>` returns `{ data, error, loading, refetch }`; cache keys are namespaced (`dashboard:*`, `projetos:*`).
- **Mid-sequence red test:** the architecture-guard added in Task 4 covers both pages; it goes fully green only after Task 5. Don't revert it in between.
