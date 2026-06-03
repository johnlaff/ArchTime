'use client'

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { addPendingEntry } from '@/lib/offline-queue'
import type { ActiveSession } from '@/types'

interface UseClockReturn {
  session: ActiveSession | null
  setSession: (s: ActiveSession | null) => void
  clockIn: (projectId: string | null, activityType?: string | null) => Promise<void>
  clockOut: () => Promise<void>
  loading: boolean
}

export function useClock(initialSession: ActiveSession | null): UseClockReturn {
  const [session, setSession] = useState<ActiveSession | null>(initialSession)
  const [loading, setLoading] = useState(false)
  const clockInFlightRef = useRef(false)

  const clockIn = useCallback(async (
    projectId: string | null,
    activityType: string | null = null,
  ) => {
    if (!navigator.onLine) {
      const id = crypto.randomUUID()
      const timestamp = new Date().toISOString()
      await addPendingEntry({
        id,
        entryId: id,
        type: 'clock_in',
        timestamp,
        projectId: projectId ?? undefined,
        activityType: activityType ?? undefined,
        createdAt: timestamp,
      })
      setSession({
        id,
        clockIn: timestamp,
        projectId,
        projectName: null,
        projectColor: null,
        activityType: activityType ?? null,
      })
      toast.warning('Entrada salva offline. Será sincronizada ao reconectar.')
      return
    }

    const optimisticId = crypto.randomUUID()
    setSession({
      id: optimisticId,
      clockIn: new Date().toISOString(),
      projectId,
      projectName: null,
      projectColor: null,
      activityType: activityType ?? null,
    })
    setLoading(true)
    clockInFlightRef.current = true

    try {
      const res = await fetch('/api/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, activityType }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Erro ao registrar entrada')
        setSession(null)
        return
      }
      const entry = await res.json()
      setSession({
        id: entry.id,
        clockIn: entry.clockIn,
        projectId: projectId ?? null,
        projectName: null,
        projectColor: null,
        activityType: entry.activityType ?? activityType ?? null,
      })
      toast.success('Entrada registrada!')
    } catch {
      toast.error('Erro ao registrar entrada')
      setSession(null)
    } finally {
      clockInFlightRef.current = false
      setLoading(false)
    }
  }, [])

  const clockOut = useCallback(async () => {
    if (!session) return
    if (clockInFlightRef.current) return

    const snapshot = session
    setSession(null)
    setLoading(true)

    try {
      if (navigator.onLine) {
        const res = await fetch(`/api/clock/${snapshot.id}`, { method: 'PUT' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast.error(data.error ?? 'Erro ao registrar saída')
          setSession(snapshot)
          return
        }
        toast.success('Saída registrada!')
      } else {
        const timestamp = new Date().toISOString()
        await addPendingEntry({
          id: crypto.randomUUID(),
          entryId: snapshot.id,
          type: 'clock_out',
          timestamp,
          createdAt: timestamp,
        })
        toast.warning('Saída salva offline. Será sincronizada ao reconectar.')
      }
    } catch {
      toast.error('Erro ao registrar saída')
      setSession(snapshot)
    } finally {
      setLoading(false)
    }
  }, [session])

  return { session, setSession, clockIn, clockOut, loading }
}
