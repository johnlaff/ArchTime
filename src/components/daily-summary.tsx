'use client'

import { m } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActivityTag } from '@/components/activity-selector'
import { formatBRT, formatMinutes } from '@/lib/dates'
import type { BalanceSummary, DailySummary } from '@/types'

interface DailySummaryProps {
  summary: DailySummary
}

function BalanceCard({
  title,
  balance,
  cumulativeBalance,
}: {
  title: string
  balance: BalanceSummary
  cumulativeBalance?: number
}) {
  return (
    <Card>
      <CardHeader className="py-3 pb-1">
        <CardTitle className="text-sm text-muted-foreground font-normal">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-2xl font-bold tabular-nums">{formatMinutes(balance.actualMinutes)}</p>
        <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
          <p>Previsto: {formatMinutes(balance.expectedMinutes)}</p>
          <p>Saldo: {formatMinutes(balance.balanceMinutes)}</p>
          {cumulativeBalance != null && <p>Acumulado: {formatMinutes(cumulativeBalance)}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export function DailySummaryCard({ summary }: DailySummaryProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { title: 'Hoje',   balance: summary.today, cumulative: undefined as number | undefined },
          { title: 'Semana', balance: summary.week,  cumulative: undefined as number | undefined },
          {
            title: 'Mês',
            balance: summary.month,
            cumulative: summary.month.showCumulativeBalance
              ? summary.month.cumulativeBalance ?? undefined
              : undefined as number | undefined,
          },
        ].map(({ title, balance, cumulative }, i) => (
          <m.div
            key={title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <BalanceCard title={title} balance={balance} cumulativeBalance={cumulative} />
          </m.div>
        ))}
      </div>

      {summary.entries.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground px-1">
            Hoje · {summary.sessionCount} {summary.sessionCount === 1 ? 'sessão' : 'sessões'}
          </p>
          {summary.entries.slice(0, 5).map((entry, i) => (
            <Card
              key={entry.id}
              className="py-2 px-3 animate-fade-in-up hover:bg-muted/40 cursor-default"
              style={{ animationDelay: `${150 + i * 50}ms` }}
            >
              <div className="flex items-center justify-between text-sm gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {entry.projectColor && (
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: entry.projectColor }}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="tabular-nums">
                        {formatBRT(entry.clockIn)} — {entry.clockOut ? formatBRT(entry.clockOut) : '...'}
                      </span>
                      <ActivityTag activityType={entry.activityType} />
                    </div>
                    {entry.notes && (
                      <p className="text-xs text-muted-foreground/80 leading-snug truncate">{entry.notes}</p>
                    )}
                  </div>
                </div>
                {entry.totalMinutes != null && (
                  <span className="text-muted-foreground tabular-nums flex-shrink-0">{formatMinutes(entry.totalMinutes)}</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
