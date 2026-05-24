import { Suspense } from 'react'
import { getCachedUser, fetchActiveProjects, fetchWeekComparison } from '@/lib/server/sidebar-data'
import { ShortcutsWidget } from './shortcuts-widget'

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
  const absMinutes = Math.abs(cmp.deltaMinutes)
  const absH = Math.floor(absMinutes / 60)
  const absM = absMinutes % 60
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


export async function ColRight() {
  const user = await getCachedUser()
  if (!user) return null

  return (
    <aside
      className="hidden xl:flex flex-col w-[340px] flex-shrink-0 border-l border-border bg-card sticky top-0 h-screen overflow-y-auto"
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

      </div>
    </aside>
  )
}
