'use client'

import { m } from 'motion/react'
import { Card } from '@/components/ui/card'
import { ActivityTag } from '@/components/activity-selector'
import { formatBRT, formatMinutes } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { BalanceSummary, DailySummary } from '@/types'

interface DailySummaryProps {
  summary: DailySummary
}

const REVEAL_EASE = [0.16, 1, 0.3, 1] as const

/** Saldo negativo (débito) em vermelho, positivo (crédito) em verde, zero neutro. */
function saldoClass(minutes: number): string {
  if (minutes < 0) return 'text-destructive'
  if (minutes > 0) return 'text-emerald-600 dark:text-emerald-400'
  return 'text-foreground'
}

function ProgressRing({ actual, expected }: { actual: number; expected: number }) {
  const radius = 24
  const circumference = 2 * Math.PI * radius
  const ratio = expected > 0 ? Math.min(actual / expected, 1) : 0
  const label = expected > 0 ? `${Math.round((actual / expected) * 100)}%` : '—'

  return (
    // Decorativo: os números (feito, previsto, saldo) já estão no texto ao lado.
    <div className="relative flex-none" aria-hidden="true">
      <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="6"
          style={{ stroke: 'color-mix(in oklch, var(--primary) 18%, transparent)' }}
        />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ stroke: 'var(--primary)' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">
        {label}
      </span>
    </div>
  )
}

/** "Hoje" em destaque: número grande + anel de progresso (feito/previsto). */
function TodayCard({ balance }: { balance: BalanceSummary }) {
  return (
    <Card
      data-testid="summary-card-today"
      className="w-full flex-row items-center justify-between gap-4 p-4"
    >
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">Hoje</p>
        <p className="mt-1 text-3xl font-bold leading-tight tabular-nums break-words">
          {formatMinutes(balance.actualMinutes)}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground break-words">
          de {formatMinutes(balance.expectedMinutes)} · saldo{' '}
          <span className={cn('font-semibold', saldoClass(balance.balanceMinutes))}>
            {formatMinutes(balance.balanceMinutes)}
          </span>
        </p>
      </div>
      <ProgressRing actual={balance.actualMinutes} expected={balance.expectedMinutes} />
    </Card>
  )
}

/** Semana / Mês: cards compactos lado a lado. */
function CompactCard({
  title,
  balance,
  cumulative,
  testId,
}: {
  title: string
  balance: BalanceSummary
  cumulative?: number
  testId: string
}) {
  return (
    <Card data-testid={testId} className="w-full gap-1 p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-xl font-bold leading-tight tabular-nums break-words">
        {formatMinutes(balance.actualMinutes)}
      </p>
      <p className="text-xs break-words">
        <span className="text-muted-foreground">saldo </span>
        <span className={cn('font-semibold', saldoClass(balance.balanceMinutes))}>
          {formatMinutes(balance.balanceMinutes)}
        </span>
      </p>
      {cumulative != null && (
        <p className="text-xs text-muted-foreground break-words">
          acum. {formatMinutes(cumulative)}
        </p>
      )}
    </Card>
  )
}

export function DailySummaryCard({ summary }: DailySummaryProps) {
  const cumulative = summary.month.showCumulativeBalance
    ? summary.month.cumulativeBalance ?? undefined
    : undefined

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <m.div
          className="col-span-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: REVEAL_EASE }}
        >
          <TodayCard balance={summary.today} />
        </m.div>
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.25, ease: REVEAL_EASE }}
        >
          <CompactCard title="Semana" balance={summary.week} testId="summary-card-week" />
        </m.div>
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.25, ease: REVEAL_EASE }}
        >
          <CompactCard
            title="Mês"
            balance={summary.month}
            cumulative={cumulative}
            testId="summary-card-month"
          />
        </m.div>
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
