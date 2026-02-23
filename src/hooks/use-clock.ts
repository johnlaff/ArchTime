'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { addPendingEntry } from '@/lib/offline-queue'
import type { ActiveSession } from '@/types'

interface UseClockReturn {
  session: ActiveSession | null
  setSession: (s: ActiveSession | null) => void
  clockIn: (projectId: string | null) => Promise<void>
  clockOut: () => Promise<void>
  loading: boolean
}

export function useClock(initialSession: ActiveSession | null): UseClockReturn {
  const [session, setSession] = useState<ActiveSession | null>(initialSession)
  const [loading, setLoading] = useState(false)

  const clockIn = useCallback(async (projectId: string | null) => {
    setLoading(true)
    try {
      if (navigator.onLine) {
        const res = await fetch('/api/clock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        })
        if (!res.ok) {
          const data = await res.json()
          toast.error(data.error ?? 'Erro ao registrar entrada')
          return
        }
        const entry = await res.json()
        setSession({
          id: entry.id,
          clockIn: entry.clockIn,
          projectId: projectId ?? null,
          projectName: null,
          projectColor: null,
        })
        toast.success('Entrada registrada!')
      } else {
        const id = crypto.randomUUID()
        const timestamp = new Date().toISOString()
        await addPendingEntry({
          id,
          entryId: id,
          type: 'clock_in',
          timestamp,
          projectId: projectId ?? undefined,
          createdAt: timestamp,
        })
        setSession({
          id,
          clockIn: timestamp,
          projectId,
          projectName: null,
          projectColor: null,
        })
        toast.warning('Entrada salva offline. Será sincronizada ao reconectar.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const clockOut = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      if (navigator.onLine) {
        const res = await fetch(`/api/clock/${session.id}`, { method: 'PUT' })
        if (!res.ok) {
          toast.error('Erro ao registrar saída')
          return
        }
        toast.success('Saída registrada!')
      } else {
        const timestamp = new Date().toISOString()
        await addPendingEntry({
          id: crypto.randomUUID(),
          entryId: session.id,
          type: 'clock_out',
          timestamp,
          createdAt: timestamp,
        })
        toast.warning('Saída salva offline. Será sincronizada ao reconectar.')
      }
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [session])

  return { session, setSession, clockIn, clockOut, loading }
}
