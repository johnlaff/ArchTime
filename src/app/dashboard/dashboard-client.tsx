'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ClockButton } from '@/components/clock-button'
import { CurrentSession } from '@/components/current-session'
import { DailySummaryCard } from '@/components/daily-summary'
import { ProjectSelector } from '@/components/project-selector'
import { ActivitySelector } from '@/components/activity-selector'
import { ActivityPanel } from '@/components/activity-panel'
import { OfflineIndicator } from '@/components/offline-indicator'
import { OrphanSessionBanner } from '@/components/orphan-session-banner'
import { InstallPrompt } from '@/components/install-prompt'
import { useClock } from '@/hooks/use-clock'
import { useSupabaseQuery } from '@/hooks/use-supabase-query'
import { createClient } from '@/lib/supabase/client'
import { fetchActiveSession, fetchProjects } from '@/lib/client-data'
import { getLocalDateBRT } from '@/lib/dates'
import { CLOCK_TOGGLE_EVENT, consumePendingClockToggle, setPendingClockToggle } from '@/lib/clock-bus'
import { SYNC_COMPLETE_EVENT } from '@/lib/sync-events'
import type { ActivityType } from '@/lib/activity-types'
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

  // refetch is stable per key inside the hook; capture the stable refs so the
  // event-listener effects below subscribe once instead of on every render.
  const refetchSession = sessionQuery.refetch
  const refetchSummary = summaryQuery.refetch

  const { session, setSession, clockIn, clockOut, loading } = useClock(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null)
  // react-doctor-disable-next-line react-doctor/rerender-state-only-in-handlers -- `seeded` controla o render via `shellLoading` (sai do skeleton); precisa ser state para forçar o re-render quando os dados chegam, inclusive quando a sessão é null (setSession(null) sofre bail-out por Object.is e não re-renderiza sozinho).
  const [seeded, setSeeded] = useState(false)

  // Seed the optimistic clock state once from the first server read; after that,
  // clockIn/clockOut own the session locally. Revalidations update the cache only.
  // After seeding, consume any pending clock toggle that was deferred from another route.
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler -- seed único de inicialização (não é event handler disfarçado): semeia o estado otimista do relógio a partir do 1º read assíncrono do servidor; não há evento de usuário que possa hospedar essa lógica.
    if (!seeded && !sessionQuery.loading) {
      // react-doctor-disable-next-line react-doctor/no-chain-state-updates -- seed atômico que inicializa estados de fontes distintas (seeded local, session do hook useClock, selectedProjectId local); o React agrupa estes updates num único re-render.
      setSeeded(true)
      setSession(sessionQuery.data ?? null)
      // react-doctor-disable-next-line react-doctor/no-chain-state-updates, react-doctor/no-derived-state -- selectedProjectId é inicializado uma vez do servidor e depois controlado pelo usuário (ProjectSelector); calcular no render sobrescreveria a seleção do usuário a cada revalidação.
      setSelectedProjectId(sessionQuery.data?.projectId ?? null)
      // Consume toggle pendente aqui (no mesmo efeito que marca seeded=true) para
      // evitar um estado extra e um re-render desnecessário.
      if (consumePendingClockToggle()) toggleRef.current()
    }
  }, [seeded, sessionQuery.loading, sessionQuery.data, setSession])

  useEffect(() => {
    const onSync = () => {
      refetchSession()
      refetchSummary()
    }
    window.addEventListener(SYNC_COMPLETE_EVENT, onSync)
    return () => window.removeEventListener(SYNC_COMPLETE_EVENT, onSync)
  }, [refetchSession, refetchSummary])

  // The daily summary's week balance depends on weekStartDay; refetch when settings
  // change so it updates without a manual reload (covers the in-flight cold-save race).
  useEffect(() => {
    const onSettingsChanged = () => refetchSummary()
    window.addEventListener('archtime:settings-changed', onSettingsChanged)
    return () => window.removeEventListener('archtime:settings-changed', onSettingsChanged)
  }, [refetchSummary])

  async function handleClockIn() {
    await clockIn(selectedProjectId, selectedActivity)
    sessionQuery.refetch()
    summaryQuery.refetch()
  }

  async function handleClockOut() {
    await clockOut()
    sessionQuery.refetch()
    summaryQuery.refetch()
  }

  // Clock toggle requested by the command palette / `B` key (docs/adr/0001). The ref
  // always points at the latest handlers so the listener subscribes once.
  const toggleRef = useRef<() => void>(() => {})
  // react-doctor-disable-next-line react-doctor/no-ref-current-in-render -- latest-ref pattern (ver comentário acima): atribuição idempotente em render mantém o ref no handler mais recente para o listener assinar uma vez; não vaza estado de UI.
  toggleRef.current = () => {
    // Toggled before the optimistic session is seeded (brief skeleton window):
    // defer so we don't clock IN over an already-open server session. The
    // post-seed effect below consumes the pending toggle once ready.
    if (!seeded) {
      setPendingClockToggle()
      return
    }
    if (loading) return
    if (session) handleClockOut()
    else handleClockIn()
  }

  useEffect(() => {
    const onToggle = () => toggleRef.current()
    window.addEventListener(CLOCK_TOGGLE_EVENT, onToggle)
    return () => window.removeEventListener(CLOCK_TOGGLE_EVENT, onToggle)
  }, [])

  // Show the full skeleton (matching final dimensions) until session+projects are
  // ready AND the clock state is seeded — holds CLS < 0.1 and avoids a session flash.
  const shellLoading = projectsQuery.loading || sessionQuery.loading || !seeded
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
          <m.div
            key="current-session"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <CurrentSession session={session} />
          </m.div>
        )}
      </AnimatePresence>

      {!session && (
        <div className="space-y-3">
          <ProjectSelector
            projects={projects}
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            disabled={loading}
          />
          <ActivitySelector value={selectedActivity} onChange={setSelectedActivity} disabled={loading} />
        </div>
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

      <ActivityPanel />
    </div>
  )
}
