'use client'

import { useEffect, useRef, useState } from 'react'
import { ActivityCalendar, type Activity } from 'react-activity-calendar'
import { useTheme } from 'next-themes'
import 'react-activity-calendar/tooltips.css'
import { formatMinutes } from '@/lib/dates'
import type { HeatmapDay } from '@/types'

// Escala opaca e monotônica com color-mix: mistura progressivamente --primary sobre
// --card. As vars CSS resolvem no runtime e já alternam com .dark — o mesmo array
// serve para os dois temas. Nível 0 é neutro (superfície), níveis 1-4 crescem em
// intensidade. Sem transparência → "menos" nunca parece mais forte que "mais",
// mesmo com accent custom forte (rosa, fúcsia etc.) no tema escuro.
function heatColor(level: 0 | 1 | 2 | 3 | 4): string {
  switch (level) {
    case 0:
      return 'color-mix(in oklab, var(--card) 94%, var(--foreground))'
    case 1:
      return 'color-mix(in oklab, var(--primary) 18%, var(--card))'
    case 2:
      return 'color-mix(in oklab, var(--primary) 42%, var(--card))'
    case 3:
      return 'color-mix(in oklab, var(--primary) 66%, var(--card))'
    case 4:
      return 'color-mix(in oklab, var(--primary) 92%, var(--card))'
  }
}

const LEVELS = [0, 1, 2, 3, 4] as const
const HEAT_COLORS = LEVELS.map(heatColor)
const HEAT_THEME = { light: HEAT_COLORS, dark: HEAT_COLORS }

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
 * ranges (e.g. Semestre vs Ano) therefore get visibly different cell sizes.
 */
export function Heatmap({ days }: { days: HeatmapDay[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const weeks = Math.max(1, Math.ceil(days.length / 7))
  const [blockSize, setBlockSize] = useState(13)
  const { resolvedTheme } = useTheme()

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
  const colorScheme = resolvedTheme === 'dark' ? 'dark' : 'light'

  return (
    <div ref={containerRef} className="w-full">
      <div className="overflow-x-auto pb-1">
        <div className="mx-auto w-fit">
          <ActivityCalendar
            data={data}
            theme={HEAT_THEME}
            colorScheme={colorScheme}
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
        {HEAT_COLORS.map((color, i) => (
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
