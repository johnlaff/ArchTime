'use client'

// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts é usado via múltiplos named imports inline no JSX; extrair para next/dynamic exigiria criar um segundo arquivo (fora do escopo desta edição)
import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { formatMinutes } from '@/lib/dates'
import type { WeekBar } from '@/types'

const chartConfig = { hours: { label: 'Horas' } } satisfies ChartConfig

interface Datum {
  day: string
  minutes: number
  hours: number
  goal: number
  met: boolean
}

function barFill(datum: Datum): string {
  if (datum.minutes === 0) return 'var(--muted)'
  // Segue a cor de accent (como o heatmap): cheio quando bate a meta, 50% abaixo dela.
  if (datum.met) return 'var(--primary)' // bateu a meta do dia
  return 'oklch(from var(--primary) l c h / 0.5)' // abaixo da meta / sem meta
}

function WeekTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: Datum }>
}) {
  if (!active || !payload?.length) return null
  const datum = payload[0].payload
  return (
    <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium capitalize">{datum.day}</p>
      <p className="tabular-nums text-muted-foreground">
        {datum.minutes > 0 ? formatMinutes(datum.minutes) : 'sem registro'}
        {datum.goal > 0 ? ` · meta ${formatMinutes(datum.goal)}` : ''}
      </p>
    </div>
  )
}

export function WeekBars({ week }: { week: WeekBar[] }) {
  const data: Datum[] = week.map((day) => ({
    day: day.dayLabel,
    minutes: day.totalMinutes,
    hours: Number((day.totalMinutes / 60).toFixed(2)),
    goal: day.goalMinutes,
    met: day.goalMinutes > 0 && day.totalMinutes >= day.goalMinutes,
  }))
  const goalMinutes = Math.max(0, ...week.map((day) => day.goalMinutes))
  const maxHours = Math.max(goalMinutes / 60, ...data.map((day) => day.hours), 1)
  const hasData = week.some((day) => day.totalMinutes > 0)

  if (!hasData) {
    return (
      <div className="flex h-[160px] flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm text-muted-foreground">Nenhum registro nesta semana.</p>
        <p className="text-xs text-muted-foreground/70">As horas por dia aparecem aqui conforme você bate o ponto.</p>
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[160px] w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
        <YAxis hide domain={[0, Math.ceil(maxHours)]} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={6} />
        {goalMinutes > 0 && (
          <ReferenceLine y={goalMinutes / 60} stroke="var(--border-2)" strokeDasharray="4 4" strokeWidth={1} />
        )}
        <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={<WeekTooltip />} />
        <Bar dataKey="hours" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((datum) => (
            <Cell key={datum.day} fill={barFill(datum)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
