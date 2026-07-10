'use client'

import { useEffect } from 'react'
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
  useEffect(() => {
    let disposed = false
    let syncInFlight = false
    let retryAttempt = 0
    let retryTimer: number | null = null
    let requestVersion = 0

    function clearScheduledRetry() {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    function scheduleRetry() {
      if (disposed || !navigator.onLine || retryTimer !== null) return

      const delay = retryDelayWithJitter(retryAttempt)
      retryAttempt += 1
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        void runSync()
      }, delay)
    }

    async function runSync() {
      if (disposed || syncInFlight) return
      syncInFlight = true
      const runRequestVersion = requestVersion

      try {
        const result = await syncPendingEntries()
        if (disposed) return

        if (result.synced > 0 || result.failed > 0) {
          window.dispatchEvent(new CustomEvent(SYNC_COMPLETE_EVENT, { detail: result }))
        }
        if (result.synced > 0) {
          toast.success(`${result.synced} registro(s) offline sincronizado(s)`)
        }
        if (result.failed > 0) {
          toast.warning(`${result.failed} registro(s) offline precisam de revisão`)
        }

        // Uma nova intenção pode entrar na fila enquanto este flush ainda lia o
        // IndexedDB. Nesse caso, não deixe o resultado antigo cancelar o retry novo.
        if ((result.remaining > 0 || requestVersion !== runRequestVersion) && navigator.onLine) {
          scheduleRetry()
        } else {
          clearScheduledRetry()
          retryAttempt = 0
        }
      } catch {
        // Erro inesperado do IndexedDB não pode abandonar a intenção de sincronizar.
        if (!disposed) scheduleRetry()
      } finally {
        syncInFlight = false
      }
    }

    // Sync on mount if online
    if (navigator.onLine) {
      runSync()
    }

    const handleOnline = () => {
      requestVersion += 1
      clearScheduledRetry()
      retryAttempt = 0
      void runSync()
    }
    const handleSyncRequest = () => {
      requestVersion += 1
      scheduleRetry()
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener(REQUEST_PENDING_SYNC_EVENT, handleSyncRequest)
    return () => {
      disposed = true
      clearScheduledRetry()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener(REQUEST_PENDING_SYNC_EVENT, handleSyncRequest)
    }
  }, [])

  return <>{children}</>
}
