'use client'

import { Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useTimer } from '@/hooks/use-timer'
import type { ActiveSession } from '@/types'

interface CurrentSessionProps {
  session: ActiveSession | null
}

export function CurrentSession({ session }: CurrentSessionProps) {
  const elapsed = useTimer(session?.clockIn ?? null)

  if (!session) return null

  return (
    <Card className="border-emerald-500/50 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 animate-scale-in">
      <CardContent className="py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Clock className="h-4 w-4 text-emerald-500" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Em andamento</p>
            {session.projectName && (
              <p className="text-sm font-medium flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: session.projectColor ?? '#6366f1' }}
                />
                {session.projectName}
              </p>
            )}
          </div>
        </div>
        <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
          {elapsed}
        </span>
      </CardContent>
    </Card>
  )
}
