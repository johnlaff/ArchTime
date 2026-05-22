# Phase 2: Sidebar + Layout Desktop 3 Colunas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-column `max-w-screen-md` layout with a responsive 3-column layout (sidebar 260px + fluid main + right column 340px) using RSC + Suspense streaming for zero JS overhead on the layout shell.

**Architecture:** `layout.tsx` (Server Component) gains `<AppSidebar>` (lg: ≥1024px) and `<ColRight>` (xl: ≥1280px) alongside `<Navbar>` (mobile only, unchanged). Only `SidebarNav` and `SidebarFooterControls` are Client Components. Data streams via Suspense — layout renders immediately while DB responds. Sidebar data functions use the same `'use cache'` + `cacheLife` + `cacheTag` pattern already established in `dashboard/page.tsx`.

**Tech Stack:** Next.js 15 App Router, React 19 `cache()` for auth dedup, `'use cache'` + `cacheLife`/`cacheTag` from `next/cache`, Prisma `$queryRaw` for aggregation queries, Tailwind CSS v4, Supabase auth (`User` from `@supabase/supabase-js`)

---

## File Map

**New files:**
| File | Responsibility |
|---|---|
| `src/lib/server/sidebar-data.ts` | `getCachedUser`, `fetchActiveProjects`, `fetchWeekComparison` |
| `src/lib/__tests__/sidebar-data.test.ts` | Unit tests for data functions |
| `src/components/page-shell.tsx` | `PageShell` — max-width + padding wrapper for all pages |
| `src/components/sidebar-nav.tsx` | `SidebarNav` — `'use client'`, `usePathname` for active state |
| `src/components/sidebar-footer-controls.tsx` | `SidebarFooterControls` — `'use client'`, theme/accent/logout |
| `src/components/sidebar.tsx` | `AppSidebar`, `ActiveProjects`, `ProjectsSkeleton` — all Server |
| `src/components/col-right.tsx` | `ColRight`, `TrendWidget`, `DistributionWidget`, `ShortcutsWidget`, `BillingWidget` — all Server |
| `prisma/migrations/20260522_phase2_indexes/migration.sql` | Partial unique index on open sessions |

**Modified files:**
| File | Change |
|---|---|
| `prisma/schema.prisma` | +2 `@@index` on `ClockEntry` |
| `src/app/layout.tsx` | 3-col structure: Navbar (mobile) + AppSidebar + main + ColRight |
| `src/app/dashboard/page.tsx` | Wrap return in `<PageShell>` |
| `src/app/historico/page.tsx` | Wrap return in `<PageShell>` |
| `src/app/projetos/page.tsx` | Wrap return in `<PageShell>` |
| `src/app/configuracoes/page.tsx` | Wrap return in `<PageShell>` |
| `src/app/api/clock/route.ts` | `revalidateTag('sidebar-${user.id}')` after clock-in |
| `src/app/api/clock/[id]/route.ts` | `revalidateTag` after PATCH (clock-out) and PUT (manual edit) |

---

### Task 1: DB — Schema Indexes + Partial Index Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260522_phase2_indexes/migration.sql`

- [ ] **Step 1: Add 2 composite indexes to ClockEntry**

In `prisma/schema.prisma`, find the `ClockEntry` model's `@@index` block (currently has `@@index([userId, entryDate])` and `@@index([userId, clockIn])`). Add two more lines immediately before `@@map("clock_entries")`:

```prisma
  @@index([userId, entryDate])
  @@index([userId, clockIn])
  @@index([userId, clockOut, deletedAt])
  @@index([userId, deletedAt, entryDate])
  @@map("clock_entries")
```

- [ ] **Step 2: Push schema to DB**

```bash
cd pontoarq
npx prisma db push
```

Expected output contains: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Create migration SQL file**

Create the directory and file `prisma/migrations/20260522_phase2_indexes/migration.sql`:

```sql
-- Enforces at most 1 open session per user at the DB level.
-- Prevents race conditions independently of application logic.
-- CONCURRENTLY avoids write locks during index creation on production.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_clock_open_session
  ON clock_entries(user_id)
  WHERE clock_out IS NULL AND deleted_at IS NULL;
```

- [ ] **Step 4: Apply the partial index via Supabase SQL editor**

Copy the SQL above and run it in the Supabase project's SQL editor (Dashboard → SQL Editor). The statement is idempotent (`IF NOT EXISTS`) — safe to re-run.

Alternatively, if `psql` is available with `DIRECT_URL`:
```bash
psql "$DIRECT_URL" -f prisma/migrations/20260522_phase2_indexes/migration.sql
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add composite indexes and partial open-session index for phase 2"
```

---

### Task 2: Server Data Layer — `sidebar-data.ts` (TDD)

**Files:**
- Create: `src/lib/server/sidebar-data.ts`
- Create: `src/lib/__tests__/sidebar-data.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/sidebar-data.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn() },
}))

const { fetchActiveProjects, fetchWeekComparison } = await import('../sidebar-data')
const { prisma } = await import('@/lib/prisma')

describe('fetchActiveProjects', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps snake_case DB columns to camelCase', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      { id: 'p1', name: 'Torre Alpha', color: '#6366f1', month_minutes: 120 },
    ])

    const result = await fetchActiveProjects('user-1')

    expect(result).toEqual([
      { id: 'p1', name: 'Torre Alpha', color: '#6366f1', monthMinutes: 120 },
    ])
  })

  it('returns empty array when no active projects', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
    expect(await fetchActiveProjects('user-1')).toEqual([])
  })
})

describe('fetchWeekComparison', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps columns and computes deltaPercent', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      { this_week_minutes: 1800, last_week_minutes: 1500, delta_minutes: 300 },
    ])

    const result = await fetchWeekComparison('user-1')

    expect(result).toEqual({
      thisWeekMinutes: 1800,
      lastWeekMinutes: 1500,
      deltaMinutes: 300,
      deltaPercent: 20,
    })
  })

  it('returns deltaPercent null when last week was zero', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      { this_week_minutes: 600, last_week_minutes: 0, delta_minutes: 600 },
    ])

    const result = await fetchWeekComparison('user-1')
    expect(result.deltaPercent).toBeNull()
  })

  it('returns zeros when no data exists', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
    const result = await fetchWeekComparison('user-1')
    expect(result).toEqual({ thisWeekMinutes: 0, lastWeekMinutes: 0, deltaMinutes: 0, deltaPercent: null })
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- sidebar-data
```

Expected: FAIL — `Cannot find module '../sidebar-data'`

- [ ] **Step 3: Implement `src/lib/server/sidebar-data.ts`**

```ts
import { cache } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'

export interface ActiveProject {
  id: string
  name: string
  color: string
  monthMinutes: number
}

export interface WeekComparison {
  thisWeekMinutes: number
  lastWeekMinutes: number
  deltaMinutes: number
  deltaPercent: number | null
}

// Deduplicates the Supabase auth call within a single React render pass.
export const getCachedUser = cache(getAuthenticatedUser)

type RawActiveProject = { id: string; name: string; color: string; month_minutes: number }

export async function fetchActiveProjects(userId: string): Promise<ActiveProject[]> {
  'use cache'
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  cacheTag(`sidebar-${userId}`)

  const rows = await prisma.$queryRaw<RawActiveProject[]>`
    SELECT
      p.id,
      p.name,
      p.color,
      COALESCE(SUM(ta.minutes), 0)::int AS month_minutes
    FROM projects p
    LEFT JOIN time_allocations ta ON ta.project_id = p.id
    LEFT JOIN clock_entries ce
      ON ce.id = ta.clock_entry_id
      AND ce.deleted_at IS NULL
      AND ce.entry_date >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
    WHERE p.user_id = ${userId} AND p.is_active = true
    GROUP BY p.id, p.name, p.color
    ORDER BY month_minutes DESC, p.name
    LIMIT 4
  `
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    monthMinutes: Number(r.month_minutes),
  }))
}

type RawWeekRow = { this_week_minutes: number; last_week_minutes: number; delta_minutes: number }

export async function fetchWeekComparison(userId: string): Promise<WeekComparison> {
  'use cache'
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  cacheTag(`sidebar-${userId}`)

  const rows = await prisma.$queryRaw<RawWeekRow[]>`
    WITH
    this_week AS (
      SELECT COALESCE(SUM(ta.minutes), 0) AS minutes
      FROM time_allocations ta
      JOIN clock_entries ce ON ce.id = ta.clock_entry_id
      WHERE ce.user_id = ${userId}
        AND ce.deleted_at IS NULL
        AND ce.entry_date >= date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')
        AND ce.entry_date <  date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '7 days'
    ),
    last_week AS (
      SELECT COALESCE(SUM(ta.minutes), 0) AS minutes
      FROM time_allocations ta
      JOIN clock_entries ce ON ce.id = ta.clock_entry_id
      WHERE ce.user_id = ${userId}
        AND ce.deleted_at IS NULL
        AND ce.entry_date >= date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '7 days'
        AND ce.entry_date <  date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')
    )
    SELECT
      this_week.minutes::int AS this_week_minutes,
      last_week.minutes::int AS last_week_minutes,
      (this_week.minutes - last_week.minutes)::int AS delta_minutes
    FROM this_week, last_week
  `
  const row = rows[0]
  if (!row) return { thisWeekMinutes: 0, lastWeekMinutes: 0, deltaMinutes: 0, deltaPercent: null }

  const lw = Number(row.last_week_minutes)
  return {
    thisWeekMinutes: Number(row.this_week_minutes),
    lastWeekMinutes: lw,
    deltaMinutes: Number(row.delta_minutes),
    deltaPercent: lw > 0 ? Math.round((Number(row.delta_minutes) / lw) * 100) : null,
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- sidebar-data
```

Expected: 5 tests PASS

- [ ] **Step 5: Run full suite to check no regressions**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/sidebar-data.ts src/lib/__tests__/sidebar-data.test.ts
git commit -m "feat: add sidebar data layer — fetchActiveProjects and fetchWeekComparison with use-cache"
```

---

### Task 3: `PageShell` Component

**Files:**
- Create: `src/components/page-shell.tsx`

- [ ] **Step 1: Create `src/components/page-shell.tsx`**

```tsx
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[920px] mx-auto w-full px-4 sm:px-6 py-6">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/page-shell.tsx
git commit -m "feat: add PageShell wrapper for 3-col layout page content"
```

---

### Task 4: `SidebarNav` Client Component

**Files:**
- Create: `src/components/sidebar-nav.tsx`

- [ ] **Step 1: Create `src/components/sidebar-nav.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { Clock, History, FolderOpen, Settings, BarChart2, CreditCard } from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  kbd: string
  disabled?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',     label: 'Ponto',         icon: Clock,       kbd: 'P' },
  { href: '/historico',     label: 'Histórico',     icon: History,     kbd: 'H' },
  { href: '/projetos',      label: 'Projetos',      icon: FolderOpen,  kbd: 'J' },
  { href: '/configuracoes', label: 'Configurações', icon: Settings,    kbd: 'S' },
  { href: '/relatorios',    label: 'Relatórios',    icon: BarChart2,   kbd: 'R', disabled: true },
  { href: '/faturamento',   label: 'Faturamento',   icon: CreditCard,  kbd: 'F', disabled: true },
]

export function SidebarNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon, kbd, disabled }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={disabled ? '#' : href}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
            onMouseEnter={() => !disabled && router.prefetch(href)}
            onClick={(e) => { if (disabled) e.preventDefault() }}
            className={[
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors select-none',
              disabled
                ? 'pointer-events-none opacity-40 text-muted-foreground cursor-not-allowed'
                : isActive
                ? 'bg-accent text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            ].join(' ')}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{label}</span>
            <kbd className="font-mono text-[10px] text-muted-foreground/50 border border-border/50 rounded px-1 py-px">
              {kbd}
            </kbd>
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sidebar-nav.tsx
git commit -m "feat: add SidebarNav client component with active-state detection and prefetch"
```

---

### Task 5: `SidebarFooterControls` Client Component

**Files:**
- Create: `src/components/sidebar-footer-controls.tsx`

- [ ] **Step 1: Create `src/components/sidebar-footer-controls.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Moon, Sun, Palette, Settings, LogOut } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createClient } from '@/lib/supabase/client'
import { useAccentColor, ACCENTS } from '@/components/accent-color-provider'
import { ACCENT_PRESETS, type AccentPreset } from '@/lib/preferences'
import { getNextThemeMode, markLocalPreferenceChange, persistAppearanceSettings } from '@/lib/appearance'

const ACCENT_ORDER = Object.keys(ACCENT_PRESETS) as AccentPreset[]

export interface SidebarFooterProps {
  email: string
  initials: string
}

export function SidebarFooterControls({ email, initials }: SidebarFooterProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const { accent, setAccent } = useAccentColor()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function persistAppearance(patch: Parameters<typeof persistAppearanceSettings>[0]) {
    persistAppearanceSettings(patch).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar aparência')
    })
  }

  function handleAccentChange(next: AccentPreset) {
    setAccent(next)
    persistAppearance({ accentPreset: next })
  }

  function handleThemeToggle() {
    const next = getNextThemeMode(resolvedTheme)
    markLocalPreferenceChange()
    setTheme(next)
    persistAppearance({ themeMode: next })
  }

  return (
    <div className="mt-auto border-t border-border pt-3 flex flex-col gap-2">
      {/* User info */}
      <div className="flex items-center gap-2 px-1">
        <div
          className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          aria-hidden="true"
        >
          {initials}
        </div>
        <span className="flex-1 text-xs text-muted-foreground truncate">{email}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 px-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Cor de destaque">
              <Palette className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3 animate-fade-in" align="start" side="top">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Cor de destaque</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ACCENT_ORDER.map((key) => (
                <button
                  key={key}
                  onClick={() => handleAccentChange(key)}
                  title={ACCENT_PRESETS[key].label}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs transition-colors ${
                    accent === key ? 'border-primary bg-accent' : 'hover:bg-accent'
                  }`}
                >
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: ACCENTS[key] }} />
                  {ACCENT_PRESETS[key].label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleThemeToggle} aria-label="Alternar tema">
          <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        <Button variant="ghost" size="icon" className="h-7 w-7" asChild aria-label="Configurações">
          <Link href="/configuracoes"><Settings className="h-3.5 w-3.5" /></Link>
        </Button>

        <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={handleLogout} aria-label="Sair">
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sidebar-footer-controls.tsx
git commit -m "feat: add SidebarFooterControls — accent picker, theme toggle, settings link, logout"
```

---

### Task 6: `AppSidebar` Server Component

**Files:**
- Create: `src/components/sidebar.tsx`

- [ ] **Step 1: Create `src/components/sidebar.tsx`**

This file has no `'use client'` — it is entirely Server Components. It imports the two Client Components created in Tasks 4 and 5.

```tsx
import { Suspense } from 'react'
import { SidebarNav } from './sidebar-nav'
import { SidebarFooterControls } from './sidebar-footer-controls'
import { getCachedUser, fetchActiveProjects, type ActiveProject } from '@/lib/server/sidebar-data'

function SidebarBrand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-[7px] flex-shrink-0"
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        <svg width="20" height="20" viewBox="0 0 100 100" fill="none" aria-hidden="true">
          <circle cx="50" cy="11" r="9" fill="currentColor" />
          <line x1="50" y1="11" x2="13" y2="87" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
          <line x1="50" y1="11" x2="87" y2="87" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
          <line x1="27" y1="60" x2="73" y2="60" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        </svg>
      </span>
      <span className="font-semibold text-sm tracking-tight">ArchTime</span>
      <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">v2</span>
    </div>
  )
}

export function ProjectsSkeleton() {
  return (
    <div className="flex flex-col gap-1 animate-pulse" aria-hidden="true">
      {[70, 85, 55].map((w) => (
        <div key={w} className="flex items-center gap-2 px-2.5 py-1.5">
          <div className="h-2 w-2 rounded-full bg-muted flex-shrink-0" />
          <div className="h-3 rounded bg-muted flex-1" style={{ maxWidth: `${w}%` }} />
          <div className="h-3 w-6 rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

async function ActiveProjects({ userId }: { userId: string }) {
  const projects = await fetchActiveProjects(userId)

  if (projects.length === 0) {
    return (
      <p className="px-2.5 text-xs text-muted-foreground italic">Nenhum projeto ativo este mês.</p>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {projects.map((p: ActiveProject) => (
        <div
          key={p.id}
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-accent/30 transition-colors"
        >
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="flex-1 text-sm text-muted-foreground truncate">{p.name}</span>
          <span className="font-mono text-xs text-muted-foreground/60 flex-shrink-0">
            {Math.round(p.monthMinutes / 60)}h
          </span>
        </div>
      ))}
    </div>
  )
}

export async function AppSidebar() {
  const user = await getCachedUser()
  if (!user) return null

  const email = user.email ?? ''
  const initials = email.split('@')[0]?.slice(0, 2).toUpperCase() ?? '??'

  return (
    <aside
      className="hidden lg:flex flex-col w-[260px] flex-shrink-0 border-r border-border bg-card sticky top-0 h-screen overflow-y-auto"
      style={{ contain: 'layout style paint' }}
    >
      <div className="flex flex-col gap-5 p-4 h-full">
        <SidebarBrand />

        <SidebarNav />

        <div className="flex flex-col gap-2">
          <p className="px-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/60">
            Projetos ativos
          </p>
          <Suspense fallback={<ProjectsSkeleton />}>
            <ActiveProjects userId={user.id} />
          </Suspense>
        </div>

        <SidebarFooterControls email={email} initials={initials} />
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat: add AppSidebar server component with brand, nav, streaming projects, and footer"
```

---

### Task 7: `ColRight` Server Component + Widgets

**Files:**
- Create: `src/components/col-right.tsx`

- [ ] **Step 1: Create `src/components/col-right.tsx`**

```tsx
import { Suspense } from 'react'
import { getCachedUser, fetchActiveProjects, fetchWeekComparison } from '@/lib/server/sidebar-data'

function WidgetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-muted" style={{ width: `${60 + (i % 3) * 12}%` }} />
      ))}
    </div>
  )
}

function Widget({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 flex flex-col gap-2.5">
      <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/60">{title}</p>
      {children}
    </div>
  )
}

async function TrendWidget({ userId }: { userId: string }) {
  const cmp = await fetchWeekComparison(userId)
  const isUp = cmp.deltaMinutes >= 0
  const absH = Math.abs(Math.floor(cmp.deltaMinutes / 60))
  const absM = Math.abs(cmp.deltaMinutes % 60)
  const label = absH > 0 ? `${absH}h ${absM}min` : `${absM}min`

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {cmp.deltaMinutes === 0
          ? 'Ritmo igual ao da semana passada.'
          : isUp
          ? 'Você está trabalhando mais do que na semana passada.'
          : 'Você está trabalhando menos do que na semana passada.'}
      </p>
      <div
        className={`flex items-center gap-2 text-sm font-semibold ${
          isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
        }`}
      >
        {isUp ? '↑' : '↓'} {label}
        {cmp.deltaPercent !== null && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded font-normal ${
              isUp
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
            }`}
          >
            {isUp ? '+' : ''}{cmp.deltaPercent}%
          </span>
        )}
      </div>
    </div>
  )
}

async function DistributionWidget({ userId }: { userId: string }) {
  const projects = await fetchActiveProjects(userId)
  if (projects.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Sem dados este mês.</p>
  }

  const total = projects.reduce((sum, p) => sum + p.monthMinutes, 0)

  return (
    <div className="flex flex-col gap-3">
      {projects.map((p) => {
        const pct = total > 0 ? Math.round((p.monthMinutes / total) * 100) : 0
        const hours = Math.floor(p.monthMinutes / 60)
        return (
          <div key={p.id} className="flex flex-col gap-1">
            <div className="flex justify-between items-baseline text-xs">
              <span className="text-foreground/80 truncate flex-1 mr-2">{p.name}</span>
              <span className="text-muted-foreground font-mono flex-shrink-0">{hours}h · {pct}%</span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ShortcutsWidget() {
  const items = [
    { desc: 'Ponto',           key: 'P' },
    { desc: 'Histórico',       key: 'H' },
    { desc: 'Projetos',        key: 'J' },
    { desc: 'Buscar / Cmds',   key: '⌘K' },
    { desc: 'Modo Foco',       key: 'F' },
    { desc: 'Alternar Tema',   key: '⌘⇧D' },
  ]
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(({ desc, key }) => (
        <div key={desc} className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{desc}</span>
          <kbd className="font-mono bg-muted border border-border rounded px-1.5 py-px text-[10px]">{key}</kbd>
        </div>
      ))}
    </div>
  )
}

export async function ColRight() {
  const user = await getCachedUser()
  if (!user) return null

  return (
    <aside
      className="hidden xl:flex flex-col w-[340px] flex-shrink-0 border-l border-border bg-card/50 sticky top-0 h-screen overflow-y-auto"
      style={{ contain: 'layout style paint' }}
    >
      <div className="flex flex-col gap-3 p-4">
        <Widget title="Tendência">
          <Suspense fallback={<WidgetSkeleton rows={2} />}>
            <TrendWidget userId={user.id} />
          </Suspense>
        </Widget>

        <Widget title="Distribuição por Projeto">
          <Suspense fallback={<WidgetSkeleton rows={4} />}>
            <DistributionWidget userId={user.id} />
          </Suspense>
        </Widget>

        <Widget title="Atalhos de Teclado">
          <ShortcutsWidget />
        </Widget>

        <Widget title="Próximo Faturamento">
          <p className="text-xs text-muted-foreground/60">
            Disponível após configurar valor/hora nos projetos (Fase 8).
          </p>
        </Widget>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/col-right.tsx
git commit -m "feat: add ColRight server component — trend, distribution, shortcuts, billing placeholder"
```

---

### Task 8: Update `layout.tsx` — 3-Column Structure

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/app/layout.tsx`, add after the existing imports:

```tsx
import { AppSidebar } from '@/components/sidebar'
import { ColRight } from '@/components/col-right'
```

- [ ] **Step 2: Replace the body structure**

Find the `<AccentColorProvider>` block. Replace the entire body content with:

```tsx
<AccentColorProvider>
  <Providers>
    <div className="block lg:hidden">
      <Navbar />
    </div>
    <div className="lg:flex lg:min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0">
        {children}
      </main>
      <ColRight />
    </div>
  </Providers>
</AccentColorProvider>
```

The old `<main className="max-w-screen-md mx-auto px-4 py-6">` is gone — pages now control their width via `PageShell`.

- [ ] **Step 3: Verify TypeScript build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no type errors. If RSC/client boundary errors appear (e.g., "You're importing a component that needs `useState`"), check that `sidebar-nav.tsx` and `sidebar-footer-controls.tsx` have `'use client'` as their first line.

- [ ] **Step 4: Check layout visually**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard`:
- At 1280px+: sidebar left, right column visible, main content in center
- At 1024px–1279px: sidebar left, no right column
- At <1024px: top navbar, no sidebar

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: update root layout to 3-column structure with AppSidebar and ColRight"
```

---

### Task 9: Wrap Pages in `PageShell`

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/historico/page.tsx`
- Modify: `src/app/projetos/page.tsx`
- Modify: `src/app/configuracoes/page.tsx`

- [ ] **Step 1: Update dashboard/page.tsx**

Add import at the top:
```tsx
import { PageShell } from '@/components/page-shell'
```

The page currently returns:
```tsx
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  )
}
```

Change to:
```tsx
export default function DashboardPage() {
  return (
    <PageShell>
      <Suspense fallback={<DashboardLoading />}>
        <DashboardContent />
      </Suspense>
    </PageShell>
  )
}
```

- [ ] **Step 2: Update historico/page.tsx, projetos/page.tsx, configuracoes/page.tsx**

Apply the same pattern to each: import `PageShell` and wrap the outermost returned JSX element. Each page has its own structure — find its `export default function` and wrap the returned JSX.

If a page's root element already has max-width or padding classes (`max-w-*`, `px-*`, `py-*`) that conflict with `PageShell`, remove those conflicting classes from the inner element so `PageShell` is the single source of width/padding.

- [ ] **Step 3: Verify each page visually**

With dev server running, open each page at 1280px viewport width and confirm:
- Content is bounded to ~920px, centered between sidebar and right column
- No horizontal overflow
- No unwanted double-padding

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/historico/page.tsx src/app/projetos/page.tsx src/app/configuracoes/page.tsx
git commit -m "feat: wrap all main pages in PageShell for 3-col layout compatibility"
```

---

### Task 10: Add `revalidateTag` to Clock API Routes

**Files:**
- Modify: `src/app/api/clock/route.ts`
- Modify: `src/app/api/clock/[id]/route.ts`

- [ ] **Step 1: Update clock/route.ts (clock-in)**

In `src/app/api/clock/route.ts`, `revalidateTag` is already imported (from the projects route pattern). If not present, add it:
```tsx
import { revalidateTag } from 'next/cache'
```

Find the line just before `return NextResponse.json(entry, { status: 201 })` in the `POST` handler and add:
```tsx
revalidateTag(`sidebar-${user.id}`)
return NextResponse.json(entry, { status: 201 })
```

- [ ] **Step 2: Update clock/[id]/route.ts (clock-out + edit)**

In `src/app/api/clock/[id]/route.ts`, add the import if missing:
```tsx
import { revalidateTag } from 'next/cache'
```

In the `PATCH` handler (clock-out): find the successful response and add before it:
```tsx
revalidateTag(`sidebar-${user.id}`)
```

In the `PUT` handler (manual time edit): find the successful response and add before it:
```tsx
revalidateTag(`sidebar-${user.id}`)
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass (the new 5 sidebar-data tests + all existing tests).

- [ ] **Step 4: Final visual check**

With dev server running:
1. Clock in on a project → wait a few seconds → navigate away and back
2. The project should appear (or update hours) in "Projetos ativos" on next hard-refresh
3. Verify `/login` page: sidebar should NOT appear (user is not authenticated, `AppSidebar` returns null)
4. Verify PWA manifest/icon still loads: `http://localhost:3000/api/icon?size=192`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/clock/route.ts src/app/api/clock/[id]/route.ts
git commit -m "feat: invalidate sidebar cache on clock-in, clock-out, and manual time edits"
```

---

## Self-Review

**Spec coverage:**
- ✅ ≥1024px sidebar visible, navbar hidden — Task 6 (`hidden lg:flex`) + Task 8 (`block lg:hidden` wrapper on Navbar)
- ✅ <1024px navbar visible, sidebar hidden — Navbar wrapper + sidebar CSS
- ✅ ≥1280px right column visible — Task 7 (`hidden xl:flex`)
- ✅ Nav active state — Task 4 (`usePathname`)
- ✅ Sidebar sticky — Task 6 (`sticky top-0 h-screen`)
- ✅ Projetos ativos dados reais — Task 2 + Task 6 (Suspense + ActiveProjects)
- ✅ Tendência widget — Task 2 + Task 7 (TrendWidget)
- ✅ Distribuição widget — Task 2 + Task 7 (DistributionWidget, reuses fetchActiveProjects)
- ✅ Atalhos static — Task 7 (ShortcutsWidget)
- ✅ Logout via sidebar — Task 5
- ✅ Tema via sidebar — Task 5
- ✅ Accent via sidebar — Task 5
- ✅ /login sem sidebar — getCachedUser() returns null → AppSidebar + ColRight return null
- ✅ Sem layout shift — Suspense skeletons in Tasks 6 + 7
- ✅ DB indexes — Task 1
- ✅ Revalidação de cache — Task 10
- ✅ PageShell para todas as pages — Tasks 3 + 9
- ✅ CSS containment — `contain: layout style paint` in Tasks 6 + 7
- ✅ Prefetch on hover — Task 4 (`router.prefetch`)
