import { Suspense } from 'react'
import { SidebarNav } from './sidebar-nav'
import { SidebarFooterControls } from './sidebar-footer-controls'
import { CommandTrigger } from './command-palette'
import { Separator } from '@/components/ui/separator'
import { getCachedUser, fetchActiveProjects, type ActiveProject } from '@/lib/server/sidebar-data'

function SidebarBrand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-[7px] flex-shrink-0"
        style={{
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          boxShadow: 'inset 0 0 0 1px var(--primary-border, transparent)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 100 100" fill="none" aria-hidden="true">
          <circle cx="50" cy="11" r="9" fill="currentColor" />
          <line x1="50" y1="11" x2="13" y2="87" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
          <line x1="50" y1="11" x2="87" y2="87" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
          <line x1="27" y1="60" x2="73" y2="60" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        </svg>
      </span>
      <span className="font-semibold text-sm tracking-tight">ArchTime</span>
    </div>
  )
}

function ProjectsSkeleton() {
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
  const name = user.user_metadata?.full_name as string | undefined
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined
  const initials = ((name ?? email.split('@')[0] ?? '')).slice(0, 2).toUpperCase() || '??'

  return (
    <aside
      className="hidden lg:flex flex-col w-[260px] flex-shrink-0 border-r border-border bg-card sticky top-0 h-screen overflow-y-auto"
      style={{ contain: 'layout style paint' }}
    >
      <div className="flex flex-col gap-5 p-4 h-full">
        <SidebarBrand />

        <CommandTrigger />

        <SidebarNav />

        <Separator />

        <div className="flex flex-col gap-2">
          <p className="px-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/60">
            Projetos ativos
          </p>
          <Suspense fallback={<ProjectsSkeleton />}>
            <ActiveProjects userId={user.id} />
          </Suspense>
        </div>

        <SidebarFooterControls email={email} initials={initials} name={name} avatarUrl={avatarUrl} />
      </div>
    </aside>
  )
}
