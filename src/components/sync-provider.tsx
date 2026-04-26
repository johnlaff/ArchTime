'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { syncPendingEntries } from '@/lib/offline-queue'

export function SyncProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    async function runSync() {
      const result = await syncPendingEntries()
      if (result.synced > 0 || result.failed > 0) {
        window.dispatchEvent(new CustomEvent('archtime:sync-complete', { detail: result }))
      }
      if (result.synced > 0) {
        toast.success(`${result.synced} registro(s) offline sincronizado(s)`)
      }
      if (result.failed > 0) {
        toast.warning(`${result.failed} registro(s) offline precisam de revisão`)
      }
    }

    // Sync on mount if online
    if (navigator.onLine) {
      runSync()
    }

    const handleOnline = () => runSync()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  return <>{children}</>
}
