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
