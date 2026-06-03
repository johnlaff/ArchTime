'use client'

import { useEffect, useRef, useState } from 'react'
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

const BLOCK_MARGIN = 3
const MIN_BLOCK = 8
const MAX_BLOCK = 22

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

/**
 * GitHub-style heatmap that fills the card width: a ResizeObserver measures the
 * container and sizes the cells so `weeks` columns span it (clamped), then the grid
 * is centred when it can't fill and scrolls horizontally when it overflows. Different
 * ranges (e.g. 6 meses vs Ano) therefore get visibly different cell sizes.
 */
export function Heatmap({ days }: { days: HeatmapDay[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const weeks = Math.max(1, Math.ceil(days.length / 7))
  const [blockSize, setBlockSize] = useState(13)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const compute = () => {
      const width = el.clientWidth
      if (!width) return
      const ideal = Math.floor(width / weeks) - BLOCK_MARGIN
      setBlockSize(Math.max(MIN_BLOCK, Math.min(MAX_BLOCK, ideal)))
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(el)
    return () => observer.disconnect()
  }, [weeks])

  const data = days.map((day) => ({ date: day.date, count: day.totalMinutes, level: day.level }))
  const byDate = new Map(days.map((day) => [day.date, day]))

  return (
    <div ref={containerRef} className="w-full">
      <div className="overflow-x-auto pb-1">
        <div className="mx-auto w-fit">
          <ActivityCalendar
            data={data}
            theme={HEAT_THEME}
            colorScheme="light"
            maxLevel={4}
            blockSize={blockSize}
            blockMargin={BLOCK_MARGIN}
            blockRadius={Math.min(4, Math.round(blockSize / 4))}
            weekStart={1}
            fontSize={11}
            showTotalCount={false}
            showColorLegend={false}
            labels={{ weekdays: WEEKDAY_LABELS, months: MONTH_LABELS }}
            tooltips={{
              activity: {
                text: (activity: Activity) =>
                  byDate.has(activity.date) ? tooltipText(byDate.get(activity.date)!) : dateLabel(activity.date),
              },
            }}
          />
        </div>
      </div>
      {/* Custom legend (centred, never clipped unlike the lib's right-aligned one). */}
      <div className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
        <span>menos</span>
        {HEAT_THEME.light.map((color, i) => (
          <span
            key={i}
            className="inline-block rounded-[3px]"
            style={{ width: 11, height: 11, background: color }}
            aria-hidden="true"
          />
        ))}
        <span>mais</span>
      </div>
    </div>
  )
}
