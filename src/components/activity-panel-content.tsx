'use client'

import { useMemo, useState, useEffect } from 'react'
import { Activity } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSupabaseQuery } from '@/hooks/use-supabase-query'
import { Heatmap } from './heatmap'
import { WeekBars } from './week-bars'
import { anoWindowStartKey, formatBRT, formatMinutes, getLocalDateBRT, getMonthRangeBRT } from '@/lib/dates'
import { buildHeatmapRange } from '@/lib/heatmap'
import type { ActivityOverview, DistributionItem, HeatmapDay, TrendInsight } from '@/types'

const MES_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const EMPTY_DAYS: HeatmapDay[] = []

function monthKeyLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${MES_ABBR[month - 1]} ${year}`
}

async function fetchOverview(): Promise<ActivityOverview> {
  const res = await fetch('/api/activity/overview')
  if (!res.ok) throw new Error('Erro ao carregar atividade')
  return res.json() as Promise<ActivityOverview>
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-4">{children}</div>
}

function Widget({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 flex flex-col gap-2.5">
      <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/60">{title}</p>
      {children}
    </div>
  )
}

function Trend({ trend }: { trend: TrendInsight }) {
  const isUp = trend.deltaMinutes >= 0
  const abs = Math.abs(trend.deltaMinutes)
  const label = abs >= 60 ? `${Math.floor(abs / 60)}h ${abs % 60}min` : `${abs}min`
  return (
    <Widget title="Tendência">
      <p className="text-sm text-muted-foreground">
        {trend.deltaMinutes === 0
          ? 'Ritmo igual ao da semana passada.'
          : isUp
            ? 'Você está trabalhando mais do que na semana passada.'
            : 'Você está trabalhando menos do que na semana passada.'}
      </p>
      <div
        className={`flex items-center gap-2 text-sm font-semibold ${
          isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
        }`}
      >
        {isUp ? '↑' : '↓'} {label}
        {trend.deltaPercent !== null && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded font-normal ${
              isUp
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
            }`}
          >
            {isUp ? '+' : ''}
            {trend.deltaPercent}%
          </span>
        )}
      </div>
    </Widget>
  )
}

function Distribution({ distribution }: { distribution: DistributionItem[] }) {
  const total = distribution.reduce((sum, p) => sum + p.monthMinutes, 0)
  return (
    <Widget title="Distribuição por Projeto">
      {distribution.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sem dados este mês.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {distribution.map((p) => {
            const pct = total > 0 ? Math.round((p.monthMinutes / total) * 100) : 0
            return (
              <div key={p.id} className="flex flex-col gap-1">
                <div className="flex justify-between items-baseline text-xs">
                  <span className="text-foreground/80 truncate flex-1 mr-2">{p.name}</span>
                  <span className="text-muted-foreground font-mono flex-shrink-0">
                    {Math.floor(p.monthMinutes / 60)}h · {pct}%
                  </span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Widget>
  )
}

function PanelSkeleton() {
  return (
    <Panel>
      <div className="flex flex-col gap-3" aria-hidden="true">
        <div className="animate-shimmer h-4 w-28 rounded" />
        <div className="animate-shimmer h-8 w-full rounded-lg" />
        <div className="animate-shimmer h-[120px] w-full rounded-lg" />
      </div>
    </Panel>
  )
}

export default function ActivityPanelContent() {
  const { data, loading, error } = useSupabaseQuery('dashboard:activity-overview', fetchOverview)

  // Calculado só no cliente: este componente retorna <PanelSkeleton/> enquanto a query
  // carrega, então o label nunca é renderizado no SSR (não há o que conflitar na hidratação).
  const [currentMonthLabel, setCurrentMonthLabel] = useState<string | null>(null)
  // react-doctor-disable-next-line react-doctor/rendering-hydration-no-flicker -- conteúdo client-only (skeleton no SSR); o label aparece junto com os dados da query, sem flicker perceptível.
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-initialize-state -- new Date() depende do cliente; computar no SSR causaria mismatch. Definido após o mount, junto com os dados da query.
    setCurrentMonthLabel(formatBRT(new Date(), "MMMM 'de' yyyy"))
  }, [])

  // Ranges de cada aba a partir dos dias do servidor + preenchimento do período à
  // frente. O servidor devolve dias até "hoje"; buildHeatmapRange completa dias/meses
  // futuros com células neutras (Mês fecha o mês corrente; Semestre e Ano exibem o
  // período por inteiro, com os meses ainda por vir em nível 0).
  const ranges = useMemo(() => {
    if (!data) return null
    const today = getLocalDateBRT()
    const monthKey = today.slice(0, 7)
    const year = Number(today.slice(0, 4))
    const month = Number(today.slice(5, 7))
    const monthRange = getMonthRangeBRT(monthKey)

    // Semestre-calendário: H1 jan–jun, H2 jul–dez do ano corrente.
    const semStart = getMonthRangeBRT(`${year}-${month <= 6 ? '01' : '07'}`).startDate
    const semEnd = getMonthRangeBRT(`${year}-${month <= 6 ? '06' : '12'}`).endDate

    // Ano = 12 meses terminando no mês vigente (ex.: ago/2025 → jul/2026).
    const anoStartKey = anoWindowStartKey(monthKey)
    const anoStart = getMonthRangeBRT(anoStartKey).startDate

    return {
      monthDays: buildHeatmapRange(data.heatmap, monthRange.startDate, monthRange.endDate),
      semesterDays: buildHeatmapRange(data.heatmap, semStart, semEnd),
      anoDays: buildHeatmapRange(data.heatmap, anoStart, monthRange.endDate),
      semesterLabel: `${month <= 6 ? '1º' : '2º'} semestre de ${year}`,
      anoRangeLabel: `${monthKeyLabel(anoStartKey)} – ${monthKeyLabel(monthKey)}`,
    }
  }, [data])
  const monthDays = ranges?.monthDays ?? EMPTY_DAYS
  const monthSummary = useMemo(() => {
    if (monthDays.length === 0) return null
    const activeDays = monthDays.filter(d => d.totalMinutes > 0)
    const totalMinutes = activeDays.reduce((sum, d) => sum + d.totalMinutes, 0)
    const bestDay = activeDays.length > 0
      ? activeDays.reduce((best, d) => (d.totalMinutes > best.totalMinutes ? d : best), activeDays[0])
      : null
    return { totalMinutes, activeCount: activeDays.length, totalDays: monthDays.length, bestDay }
  }, [monthDays])

  if (loading && !data) return <PanelSkeleton />
  if (error || !data) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">Não foi possível carregar a atividade.</p>
      </Panel>
    )
  }

  return (
    <div className="space-y-3 animate-fade-in-up" data-testid="activity-panel">
      <Panel>
        <Tabs defaultValue="semestre">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/60">
              <Activity className="h-3 w-3" aria-hidden="true" />
              Atividade
            </p>
            {/* Track e pílula ativa em tokens neutros (secondary/card): o seletor não
                herda o tint do accent — fica legível no escuro com qualquer cor custom. */}
            <TabsList className="bg-secondary">
              <TabsTrigger value="semana">Semana</TabsTrigger>
              <TabsTrigger value="mes">Mês</TabsTrigger>
              <TabsTrigger value="semestre">Semestre</TabsTrigger>
              <TabsTrigger value="ano">Ano</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="semana" className="mt-0">
            <WeekBars week={data.week} />
          </TabsContent>
          <TabsContent value="mes" className="mt-0">
            <div className="space-y-2">
              <p className="text-center text-[11px] text-muted-foreground/70 first-letter:uppercase">
                {currentMonthLabel}
              </p>
              <Heatmap days={monthDays} />
              {monthSummary && (
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1 border-t border-border/50">
                  <span>
                    Total: <span className="tabular-nums font-medium text-foreground/80">{formatMinutes(monthSummary.totalMinutes)}</span>
                  </span>
                  <span>
                    Dias ativos: <span className="tabular-nums font-medium text-foreground/80">{monthSummary.activeCount} de {monthSummary.totalDays}</span>
                  </span>
                  {monthSummary.bestDay && (
                    <span>
                      Melhor dia: <span className="tabular-nums font-medium text-foreground/80">{formatMinutes(monthSummary.bestDay.totalMinutes)}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="semestre" className="mt-0">
            <div className="space-y-2">
              <p className="text-center text-[11px] text-muted-foreground/70 first-letter:uppercase">
                {ranges?.semesterLabel}
              </p>
              <Heatmap days={ranges?.semesterDays ?? EMPTY_DAYS} />
            </div>
          </TabsContent>
          <TabsContent value="ano" className="mt-0">
            <div className="space-y-2">
              <p className="text-center text-[11px] text-muted-foreground/70">
                {ranges?.anoRangeLabel}
              </p>
              <Heatmap days={ranges?.anoDays ?? EMPTY_DAYS} />
            </div>
          </TabsContent>
        </Tabs>
      </Panel>

      {/* Insights ricos também no mobile/tablet — no desktop (≥1280px) vivem na ColRight. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
        <Trend trend={data.trend} />
        <Distribution distribution={data.distribution} />
      </div>
    </div>
  )
}
