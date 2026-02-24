# Navigation Freeze Fix + /historico + Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix page navigation freeze with loading skeletons, add DELETE endpoint for clock entries, and build a /historico page with month navigation and per-entry delete.

**Architecture:** Loading skeletons use Next.js App Router's `loading.tsx` convention — they render instantly on navigation while the Server Component fetches data. The history page follows the same server-shell + client-component pattern as /dashboard (server does auth, client does interactivity). DELETE is added to the existing `/api/clock/[id]` route.

**Tech Stack:** Next.js 15 App Router, Prisma 7, Tailwind CSS 4, shadcn/ui, date-fns-tz, sonner (toasts), lucide-react

---

## Task 1: Dashboard loading skeleton

**Files:**
- Create: `src/app/dashboard/loading.tsx`

**Step 1: Create the file**

```tsx
export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-8 w-16 bg-muted animate-pulse rounded-md" />
        <div className="h-6 w-6 bg-muted animate-pulse rounded-md" />
      </div>
      <div className="h-20 w-full bg-muted animate-pulse rounded-2xl" />
      <div className="h-24 w-full bg-muted animate-pulse rounded-xl" />
      <div className="space-y-2">
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 w-full bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Verify manually**

Run `npm run dev`, navigate away from dashboard and back. The skeleton should flash for a moment before the real content loads.

**Step 3: Run existing tests to confirm nothing broke**

```bash
npm test
```

Expected: all tests pass (9 passing).

**Step 4: Commit**

```bash
git add src/app/dashboard/loading.tsx
git commit -m "feat: add dashboard loading skeleton"
```

---

## Task 2: Projetos loading skeleton

**Files:**
- Create: `src/app/projetos/loading.tsx`

**Step 1: Create the file**

```tsx
export default function ProjetosLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-8 w-24 bg-muted animate-pulse rounded-md" />
        <div className="h-9 w-32 bg-muted animate-pulse rounded-md" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 w-full bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  )
}
```

Note: `/projetos/page.tsx` is `'use client'` so data fetches client-side — the freeze there is less severe. The skeleton still prevents any layout shift.

**Step 2: Commit**

```bash
git add src/app/projetos/loading.tsx
git commit -m "feat: add projetos loading skeleton"
```

---

## Task 3: DELETE handler for clock entries

**Files:**
- Modify: `src/app/api/clock/[id]/route.ts`

The file currently only has a `PUT` handler (clock-out). Add `DELETE` below it.

**Step 1: Read the current file first**, then append the DELETE handler:

```ts
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const entry = await prisma.clockEntry.findFirst({
    where: { id, userId: user.id },
  })

  if (!entry) {
    return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
  }

  if (!entry.clockOut) {
    return NextResponse.json(
      { error: 'Não é possível apagar uma sessão em andamento' },
      { status: 409 }
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.timeAllocation.deleteMany({ where: { clockEntryId: id } })
    await tx.clockEntry.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'delete_entry',
        entityId: id,
        newData: { deletedAt: new Date().toISOString() },
        userAgent: req.headers.get('user-agent'),
      },
    })
  })

  return new NextResponse(null, { status: 204 })
}
```

**Step 2: Run tests**

```bash
npm test
```

Expected: all pass.

**Step 3: Commit**

```bash
git add src/app/api/clock/[id]/route.ts
git commit -m "feat: add DELETE /api/clock/[id] endpoint"
```

---

## Task 4: GET /api/clock/history endpoint

**Files:**
- Create: `src/app/api/clock/history/route.ts`

**Step 1: Create the file**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') ?? new Date().toISOString().slice(0, 7)

  // Parse YYYY-MM into UTC month boundaries
  const [year, monthNum] = month.split('-').map(Number)
  const start = new Date(Date.UTC(year, monthNum - 1, 1))
  const end = new Date(Date.UTC(year, monthNum, 1))

  const entries = await prisma.clockEntry.findMany({
    where: {
      userId: user.id,
      entryDate: { gte: start, lt: end },
      clockOut: { not: null },
    },
    include: {
      allocations: {
        include: { project: { select: { name: true, color: true } } },
        take: 1,
      },
    },
    orderBy: { clockIn: 'desc' },
  })

  const mapped = entries.map((e) => ({
    id: e.id,
    clockIn: e.clockIn.toISOString(),
    clockOut: e.clockOut!.toISOString(),
    totalMinutes: e.totalMinutes,
    projectName: e.allocations[0]?.project.name ?? null,
    projectColor: e.allocations[0]?.project.color ?? null,
    entryDate: e.entryDate.toISOString(),
  }))

  const totalMinutes = mapped.reduce((s, e) => s + (e.totalMinutes ?? 0), 0)

  return NextResponse.json({
    entries: mapped,
    totalMinutes,
    sessionCount: mapped.length,
  })
}
```

**Step 2: Run tests**

```bash
npm test
```

Expected: all pass.

**Step 3: Commit**

```bash
git add src/app/api/clock/history/route.ts
git commit -m "feat: add GET /api/clock/history endpoint"
```

---

## Task 5: /historico client component

**Files:**
- Create: `src/app/historico/historico-client.tsx`

This is the main interactive component. It fetches history from the API, groups entries by day, handles month navigation and delete.

**Step 1: Create the file**

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { format, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatBRT, formatMinutes } from '@/lib/dates'

interface HistoryEntry {
  id: string
  clockIn: string
  clockOut: string
  totalMinutes: number | null
  projectName: string | null
  projectColor: string | null
  entryDate: string
}

interface HistoryData {
  entries: HistoryEntry[]
  totalMinutes: number
  sessionCount: number
}

function toYYYYMM(date: Date): string {
  return format(date, 'yyyy-MM')
}

export function HistoricoClient() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async (date: Date) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/clock/history?month=${toYYYYMM(date)}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      toast.error('Erro ao carregar histórico')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(currentMonth)
  }, [currentMonth, load])

  function prevMonth() {
    setCurrentMonth((m) => subMonths(m, 1))
  }

  function nextMonth() {
    setCurrentMonth((m) => addMonths(m, 1))
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/clock/${deleteTarget}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Registro apagado')
      setData((d) => {
        if (!d) return null
        const entries = d.entries.filter((e) => e.id !== deleteTarget)
        return {
          entries,
          totalMinutes: entries.reduce((s, e) => s + (e.totalMinutes ?? 0), 0),
          sessionCount: entries.length,
        }
      })
    } catch {
      toast.error('Erro ao apagar registro')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // Group entries by date (YYYY-MM-DD), sorted day descending
  const grouped = (data?.entries ?? []).reduce<Record<string, HistoryEntry[]>>(
    (acc, e) => {
      const key = e.entryDate.slice(0, 10)
      if (!acc[key]) acc[key] = []
      acc[key].push(e)
      return acc
    },
    {}
  )
  const dayKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const monthLabel = format(currentMonth, 'MMMM yyyy', { locale: ptBR })
  const isCurrentMonth = toYYYYMM(currentMonth) === toYYYYMM(new Date())

  return (
    <div className="space-y-4 animate-fade-in-up">
      <h1 className="text-2xl font-bold">Histórico</h1>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="font-medium capitalize">{monthLabel}</span>
        <Button variant="ghost" size="icon" onClick={nextMonth} disabled={isCurrentMonth}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : dayKeys.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nenhum registro neste mês.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {dayKeys.map((day) => (
            <div key={day} className="space-y-1 animate-fade-in-up">
              <p className="text-xs text-muted-foreground px-1 capitalize">
                {format(new Date(day + 'T12:00:00'), 'd MMM, EEEE', { locale: ptBR })}
              </p>
              {grouped[day].map((entry) => (
                <Card
                  key={entry.id}
                  className="py-2 px-3 hover:bg-muted/40 cursor-default"
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {entry.projectColor && (
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: entry.projectColor }}
                        />
                      )}
                      <div>
                        {entry.projectName && (
                          <p className="text-xs text-muted-foreground leading-none mb-0.5">
                            {entry.projectName}
                          </p>
                        )}
                        <span className="tabular-nums">
                          {formatBRT(entry.clockIn)} — {formatBRT(entry.clockOut)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {entry.totalMinutes != null && (
                        <span className="text-muted-foreground tabular-nums">
                          {formatMinutes(entry.totalMinutes)}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ))}

          {/* Month totals */}
          <div className="border-t pt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Total do mês</span>
            <span className="tabular-nums font-medium">
              {formatMinutes(data?.totalMinutes ?? 0)}&nbsp;·&nbsp;
              {data?.sessionCount ?? 0}{' '}
              {data?.sessionCount === 1 ? 'sessão' : 'sessões'}
            </span>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar registro?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Apagando...' : 'Apagar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

**Step 2: Run tests**

```bash
npm test
```

Expected: all pass (no new tests needed — this is a client component with no pure logic to unit test).

**Step 3: Commit**

```bash
git add src/app/historico/historico-client.tsx
git commit -m "feat: add HistoricoClient component with month nav and delete"
```

---

## Task 6: /historico page (server shell) + loading skeleton

**Files:**
- Create: `src/app/historico/page.tsx`
- Create: `src/app/historico/loading.tsx`

**Step 1: Create page.tsx**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { HistoricoClient } from './historico-client'

export default async function HistoricoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <HistoricoClient />
}
```

**Step 2: Create loading.tsx**

```tsx
export default function HistoricoLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-28 bg-muted animate-pulse rounded-md" />
      <div className="flex items-center justify-between">
        <div className="h-9 w-9 bg-muted animate-pulse rounded-md" />
        <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        <div className="h-9 w-9 bg-muted animate-pulse rounded-md" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  )
}
```

**Step 3: Run tests**

```bash
npm test
```

Expected: all pass.

**Step 4: Commit**

```bash
git add src/app/historico/page.tsx src/app/historico/loading.tsx
git commit -m "feat: add /historico page and loading skeleton"
```

---

## Task 7: Add Histórico to navbar

**Files:**
- Modify: `src/components/navbar.tsx`

**Step 1: Import the History icon and add the nav item**

In `navbar.tsx`, find the import line:
```ts
import { Moon, Sun, Clock, FolderOpen, LogOut } from 'lucide-react'
```

Replace with:
```ts
import { Moon, Sun, Clock, FolderOpen, History, LogOut } from 'lucide-react'
```

Find `navItems`:
```ts
const navItems = [
  { href: '/dashboard', label: 'Ponto', icon: Clock },
  { href: '/projetos', label: 'Projetos', icon: FolderOpen },
]
```

Replace with:
```ts
const navItems = [
  { href: '/dashboard', label: 'Ponto', icon: Clock },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/projetos', label: 'Projetos', icon: FolderOpen },
]
```

**Step 2: Run tests**

```bash
npm test
```

Expected: all pass.

**Step 3: Commit and push**

```bash
git add src/components/navbar.tsx
git commit -m "feat: add Histórico to navbar"
git push
```

---

## Verification Checklist

After all tasks are complete and pushed:

1. Netlify deploys successfully (watch build logs)
2. Navigate Dashboard → Projetos → Histórico → Dashboard: no freeze, skeleton shows instantly
3. Dark/light toggle: no freeze (already fixed previously)
4. /historico shows current month entries grouped by day
5. Month arrows navigate correctly; next-month arrow disabled on current month
6. Delete icon opens confirmation dialog; confirm deletes entry and updates list/total
7. Active sessions cannot be deleted (API returns 409)
8. All existing tests still pass: `npm test`
