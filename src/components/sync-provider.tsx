'use client'

import { useEffect } from 'react'
import { syncPendingEntries } from '@/lib/offline-queue'

export function SyncProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Sync on mount if online
    if (navigator.onLine) {
      syncPendingEntries()
    }

    const handleOnline = () => syncPendingEntries()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  return <>{children}</>
}
