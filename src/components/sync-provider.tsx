'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { syncPendingEntries } from '@/lib/offline-queue'
import { REQUEST_PENDING_SYNC_EVENT, SYNC_COMPLETE_EVENT } from '@/lib/sync-events'

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000]

function retryDelayWithJitter(attempt: number): number {
  const baseDelay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]
  // Evita que vários PWAs tentem sincronizar no mesmo instante após uma indisponibilidade.
  return Math.round(baseDelay * (0.8 + Math.random() * 0.4))
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const syncInFlightRef = useRef(false)
  const retryAttemptRef = useRef(0)
  const retryTimerRef = useRef<number | null>(null)

  useEffect(() => {
    function clearScheduledRetry() {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }

    function scheduleRetry() {
      if (!navigator.onLine || retryTimerRef.current !== null) return

      const delay = retryDelayWithJitter(retryAttemptRef.current)
      retryAttemptRef.current += 1
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null
        void runSync()
      }, delay)
    }

    async function runSync() {
      if (syncInFlightRef.current) return
      syncInFlightRef.current = true

      try {
        const result = await syncPendingEntries()
        if (result.synced > 0 || result.failed > 0) {
          window.dispatchEvent(new CustomEvent(SYNC_COMPLETE_EVENT, { detail: result }))
        }
        if (result.synced > 0) {
          toast.success(`${result.synced} registro(s) offline sincronizado(s)`)
        }
        if (result.failed > 0) {
          toast.warning(`${result.failed} registro(s) offline precisam de revisão`)
        }

        if (result.remaining > 0 && navigator.onLine) {
          scheduleRetry()
        } else {
          clearScheduledRetry()
          retryAttemptRef.current = 0
        }
      } catch {
        // Erro inesperado do IndexedDB não pode abandonar a intenção de sincronizar.
        scheduleRetry()
      } finally {
        syncInFlightRef.current = false
      }
    }

    // Sync on mount if online
    if (navigator.onLine) {
      runSync()
    }

    const handleOnline = () => {
      clearScheduledRetry()
      retryAttemptRef.current = 0
      void runSync()
    }
    const handleSyncRequest = () => scheduleRetry()
    window.addEventListener('online', handleOnline)
    window.addEventListener(REQUEST_PENDING_SYNC_EVENT, handleSyncRequest)
    return () => {
      clearScheduledRetry()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener(REQUEST_PENDING_SYNC_EVENT, handleSyncRequest)
    }
  }, [])

  return <>{children}</>
}
