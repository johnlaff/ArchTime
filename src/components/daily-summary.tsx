import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatBRT, formatMinutes } from '@/lib/dates'
import type { DailySummary } from '@/types'

interface DailySummaryProps {
  summary: DailySummary
}

export function DailySummaryCard({ summary }: DailySummaryProps) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="py-3 pb-1">
          <CardTitle className="text-sm text-muted-foreground font-normal">Hoje</CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <p className="text-3xl font-bold">{formatMinutes(summary.totalMinutes)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {summary.sessionCount} {summary.sessionCount === 1 ? 'sessão' : 'sessões'}
          </p>
        </CardContent>
      </Card>

      {summary.entries.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground px-1">Últimos registros</p>
          {summary.entries.slice(0, 5).map(entry => (
            <Card key={entry.id} className="py-2 px-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {entry.projectColor && (
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: entry.projectColor }}
                    />
                  )}
                  <span>
                    {formatBRT(entry.clockIn)} — {entry.clockOut ? formatBRT(entry.clockOut) : '...'}
                  </span>
                </div>
                {entry.totalMinutes != null && (
                  <span className="text-muted-foreground">{formatMinutes(entry.totalMinutes)}</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
