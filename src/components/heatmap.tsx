'use client'

import { ActivityCalendar, type Activity } from 'react-activity-calendar'
import 'react-activity-calendar/tooltips.css'
import { formatMinutes } from '@/lib/dates'
import type { HeatmapDay } from '@/types'

// Tint with the accent token (`--primary`) via relative color syntax. The CSS vars
// already flip with `.dark`, so we force colorScheme="light" and let the vars carry
// the theme — sidesteps the lib's prefers-color-scheme detection (we use a class).
// The lib has no color-parsing dependency, so var()/oklch() pass straight to SVG fill.
const HEAT_THEME = {
  light: [
    'var(--muted)',
    'oklch(from var(--primary) l c h / 0.28)',
    'oklch(from var(--primary) l c h / 0.5)',
    'oklch(from var(--primary) l c h / 0.75)',
    'var(--primary)',
  ],
  dark: [
    'var(--muted)',
    'oklch(from var(--primary) l c h / 0.32)',
    'oklch(from var(--primary) l c h / 0.55)',
    'oklch(from var(--primary) l c h / 0.78)',
    'var(--primary)',
  ],
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function dateLabel(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(d)} ${MONTH_LABELS[Number(m) - 1]}`
}

function tooltipText(day: HeatmapDay): string {
  if (day.totalMinutes < 1) return `${dateLabel(day.date)} · sem registro`
  const sessions = `${day.sessionCount} ${day.sessionCount === 1 ? 'sessão' : 'sessões'}`
  const project = day.topProject ? ` · ${day.topProject}` : ''
  return `${dateLabel(day.date)} · ${formatMinutes(day.totalMinutes)} · ${sessions}${project}`
}

export function Heatmap({ days, blockSize = 11 }: { days: HeatmapDay[]; blockSize?: number }) {
  const data = days.map((day) => ({ date: day.date, count: day.totalMinutes, level: day.level }))
  const byDate = new Map(days.map((day) => [day.date, day]))

  return (
    <div className="w-full overflow-x-auto pb-1">
      <ActivityCalendar
        data={data}
        theme={HEAT_THEME}
        colorScheme="light"
        maxLevel={4}
        blockSize={blockSize}
        blockMargin={3}
        blockRadius={3}
        weekStart={1}
        fontSize={11}
        showTotalCount={false}
        labels={{
          weekdays: WEEKDAY_LABELS,
          months: MONTH_LABELS,
          legend: { less: 'menos', more: 'mais' },
        }}
        tooltips={{
          activity: {
            text: (activity: Activity) =>
              byDate.has(activity.date) ? tooltipText(byDate.get(activity.date)!) : dateLabel(activity.date),
          },
        }}
      />
    </div>
  )
}
