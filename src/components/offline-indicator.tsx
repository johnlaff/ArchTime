'use client'

import { WifiOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useOnlineStatus } from '@/hooks/use-online-status'

export function OfflineIndicator() {
  const isOnline = useOnlineStatus()
  if (isOnline) return null

  return (
    <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-400">
      <WifiOff className="h-3 w-3" />
      Offline
    </Badge>
  )
}
