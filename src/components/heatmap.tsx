'use client'

import { useEffect, useRef, useState } from 'react'
import { ActivityCalendar, type Activity } from 'react-activity-calendar'
import { useTheme } from 'next-themes'
import 'react-activity-calendar/tooltips.css'
import { formatMinutes, getDayOfWeek, getLocalDateBRT } from '@/lib/dates'
import { heatLevelColor, heatLevelLabel } from '@/lib/heatmap'
import type { HeatmapDay } from '@/types'

// Rampa sequencial de um único matiz (o accent) sobre --card via color-mix — heatLevelColor,
// compartilhada com as barras semanais (fonte única). As vars CSS resolvem no runtime e já
// alternam com .dark, então o mesmo array serve para os dois temas. Os 4 níveis são RELATIVOS
// à jornada prevista do dia: 0 sem registro (neutro), 1 abaixo, 2 dentro (bateu a meta), 3
// acima. Escala sequencial de um matiz é daltônico-safe pela luminosidade; a distinção
// dentro↔acima é o degrau de intensidade + o tooltip (sem marcador dentro da célula).
const LEVELS = [0, 1, 2, 3] as const
const HEAT_COLORS = LEVELS.map(heatLevelColor)
const HEAT_THEME = { light: HEAT_COLORS, dark: HEAT_COLORS }

const LEGEND: { level: 0 | 1 | 2 | 3; label: string; tip: string }[] = [
  { level: 0, label: 'Sem registro', tip: 'Nenhum tempo registrado no dia.' },
  { level: 1, label: 'Abaixo da jornada', tip: 'Trabalhou, mas menos que a meta do dia.' },
  { level: 2, label: 'Dentro da jornada', tip: 'Bateu exatamente a meta do dia.' },
  {
    level: 3,
    label: 'Acima da jornada',
    tip: 'Passou da meta do dia — ou trabalho num dia sem jornada prevista.',
  },
]

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const BLOCK_MARGIN = 3
const MIN_BLOCK = 8
const MAX_BLOCK = 22
const WEEK_START = 1 // segunda

function dateLabel(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(d)} ${MONTH_LABELS[Number(m) - 1]}`
}

function tooltipText(day: HeatmapDay, today: string): string {
  // Dias futuros (padding do período à frente) mostram só a data — "sem registro"
  // soaria como falha em um dia que ainda não aconteceu.
  if (day.date > today) return dateLabel(day.date)
  if (day.totalMinutes < 1) return `${dateLabel(day.date)} · sem registro`
  const sessions = `${day.sessionCount} ${day.sessionCount === 1 ? 'sessão' : 'sessões'}`
  const project = day.topProject ? ` · ${day.topProject}` : ''
  const category =
    day.goalMinutes <= 0
      ? ' · fora da jornada prevista'
      : ` · meta ${formatMinutes(day.goalMinutes)} · ${heatLevelLabel(day.level as 1 | 2 | 3)}`
  return `${dateLabel(day.date)} · ${formatMinutes(day.totalMinutes)}${category} · ${sessions}${project}`
}

/**
 * GitHub-style heatmap that fills the card width: a ResizeObserver measures the
 * container and sizes the cells so `weeks` columns span it (clamped), then the grid
 * is centred when it can't fill and scrolls horizontally when it overflows. Different
 * ranges (e.g. Semestre vs Ano) therefore get visibly different cell sizes.
 */
export function Heatmap({ days }: { days: HeatmapDay[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  // A lib preenche a primeira semana até o WEEK_START anterior; sem contar esse
  // padding, ranges que não começam na segunda renderizam uma coluna a mais do
  // que o blockSize foi dimensionado para caber (overflow + scroll horizontal).
  const leadingPad = days.length > 0 ? (getDayOfWeek(days[0].date) - WEEK_START + 7) % 7 : 0
  const weeks = Math.max(1, Math.ceil((leadingPad + days.length) / 7))
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
  // Mesmo com HEAT_THEME idêntico nos dois temas, colorScheme é load-bearing:
  // controla o contraste do tooltip via [data-color-scheme] em tooltips.css.
  const colorScheme = resolvedTheme === 'dark' ? 'dark' : 'light'

  return (
    <div ref={containerRef} className="w-full">
      <div className="overflow-x-auto pb-1">
        <div className="mx-auto w-fit">
          <ActivityCalendar
            data={data}
            theme={HEAT_THEME}
            colorScheme={colorScheme}
            maxLevel={3}
            blockSize={blockSize}
            blockMargin={BLOCK_MARGIN}
            blockRadius={Math.min(4, Math.round(blockSize / 4))}
            weekStart={WEEK_START}
            fontSize={11}
            showTotalCount={false}
            showColorLegend={false}
            labels={{ weekdays: WEEKDAY_LABELS, months: MONTH_LABELS }}
            tooltips={{
              activity: {
                // getLocalDateBRT() roda no hover (event-time), nunca no render.
                text: (activity: Activity) =>
                  byDate.has(activity.date)
                    ? tooltipText(byDate.get(activity.date)!, getLocalDateBRT())
                    : dateLabel(activity.date),
              },
            }}
          />
        </div>
      </div>
      {/* Legenda categórica: 4 rótulos sempre visíveis (resolve WCAG 1.4.1 sem depender
          de cor sozinha) + tooltip por chip com o detalhe, no hover e no foco/toque. */}
      <div
        role="group"
        aria-label="Legenda: cor por relação com a jornada prevista"
        className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[11px]"
      >
        {LEGEND.map((item) => (
          <span key={item.level} className="group relative">
            <button
              type="button"
              aria-label={`${item.label}: ${item.tip}`}
              className="flex min-h-6 items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="inline-block rounded-[3px]"
                style={{ width: 11, height: 11, background: HEAT_COLORS[item.level] }}
                aria-hidden="true"
              />
              {item.label}
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 w-max max-w-[210px] -translate-x-1/2 translate-y-1 rounded-md bg-foreground px-2 py-1.5 text-left leading-snug text-background opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
            >
              {item.tip}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
