'use client'

import { useState, useEffect } from 'react'
import { ClockButton } from '@/components/clock-button'
import { CurrentSession } from '@/components/current-session'
import { DailySummaryCard } from '@/components/daily-summary'
import { ProjectSelector } from '@/components/project-selector'
import { OfflineIndicator } from '@/components/offline-indicator'
import { OrphanSessionBanner } from '@/components/orphan-session-banner'
import { InstallPrompt } from '@/components/install-prompt'
import { useClock } from '@/hooks/use-clock'
import type { ActiveSession, DailySummary, ProjectOption } from '@/types'

interface DashboardClientProps {
  initialSession: ActiveSession | null
  projects: ProjectOption[]
}

export function DashboardClient({
  initialSession,
  projects,
}: DashboardClientProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialSession?.projectId ?? null
  )
  const [summary, setSummary] = useState<DailySummary | null>(null)

  const { session, setSession, clockIn, clockOut, loading } = useClock(initialSession)

  useEffect(() => {
    fetch('/api/clock/summary')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSummary(data) })
      .catch(() => {})
  }, [])

  async function refreshSummary() {
    const res = await fetch('/api/clock/summary')
    if (res.ok) setSummary(await res.json())
  }

  async function handleClockIn() {
    await clockIn(selectedProjectId)
  }

  async function handleClockOut() {
    await clockOut()
    await refreshSummary()
  }

  const isOrphan =
    session && new Date(session.clockIn).toDateString() !== new Date().toDateString()

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
            refreshSummary()
          }}
        />
      )}

      {session && !isOrphan && <CurrentSession session={session} />}

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
