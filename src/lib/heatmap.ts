import { addDaysToDateString, getBrazilNationalHolidays, getDayOfWeek } from './dates'
import { WEEKDAY_KEYS, type WeekdayKey, type WorkMinutesByWeekday } from './preferences'
import type { HeatmapDay } from '@/types'

/** Dado bruto do heatmap antes de aplicar a meta (o nível depende da jornada do usuário). */
export interface HeatmapRawDay {
  date: string
  totalMinutes: number
  sessionCount: number
  topProject: string | null
}

/**
 * Cor de fundo de cada nível: rampa sequencial de um único matiz (o accent) sobre
 * --card via color-mix. Fonte ÚNICA da escala — compartilhada pelo heatmap e pelas
 * barras semanais, para as duas visões falarem exatamente a mesma língua de cor.
 */
export function heatLevelColor(level: HeatmapDay['level']): string {
  switch (level) {
    case 0:
      return 'color-mix(in oklab, var(--card) 94%, var(--foreground))'
    case 1:
      return 'color-mix(in oklab, var(--primary) 28%, var(--card))'
    case 2:
      return 'color-mix(in oklab, var(--primary) 62%, var(--card))'
    case 3:
      return 'color-mix(in oklab, var(--primary) 90%, var(--card))'
  }
}

/** Rótulo curto da categoria (para tooltips). Nível 0 é tratado como "sem registro" à parte. */
export function heatLevelLabel(level: 1 | 2 | 3): string {
  return level === 1 ? 'abaixo da jornada' : level === 2 ? 'dentro da jornada' : 'acima da jornada'
}

/** true se o usuário tem qualquer meta > 0 na semana (senão, cai no fallback absoluto). */
export function hasExpectedSchedule(schedule: WorkMinutesByWeekday): boolean {
  return WEEKDAY_KEYS.some((key) => (schedule[key] ?? 0) > 0)
}

/**
 * Nível relativo à jornada prevista do dia (4 categorias):
 * 0 sem registro · 1 abaixo · 2 dentro (bateu exatamente a meta) · 3 acima.
 * SEM tolerância: 1 minuto acima da jornada já conta como "acima". Dia sem meta
 * (feriado/fim de semana/sem jornada) trabalhado cai em "acima".
 */
export function goalHeatLevel(minutes: number, goalMinutes: number): HeatmapDay['level'] {
  if (minutes < 1) return 0
  if (goalMinutes <= 0) return 3
  if (minutes < goalMinutes) return 1
  if (minutes > goalMinutes) return 3
  return 2 // minutes === goalMinutes → cumpriu exatamente a jornada prevista
}

/**
 * Fallback para usuários sem nenhuma jornada prevista (todas as metas = 0): sem meta
 * relativa, a intensidade volta a ser por horas absolutas, em 4 níveis.
 */
export function absoluteHeatLevel(minutes: number): HeatmapDay['level'] {
  if (minutes < 1) return 0
  if (minutes < 240) return 1 // < 4h
  if (minutes < 480) return 2 // 4h–8h
  return 3 // 8h+
}

/**
 * Meta prevista do dia, já com feriado nacional aplicado (feriado → 0). Fonte única de
 * "qual era a meta deste dia" para o heatmap e para as barras semanais. `holidaysByYear`
 * é um cache passado pelo chamador para não reconstruir o Set de feriados a cada dia.
 */
export function resolveWorkGoal(
  date: string,
  schedule: WorkMinutesByWeekday,
  holidaysByYear: Map<number, Set<string>>
): number {
  const year = Number(date.slice(0, 4))
  let holidays = holidaysByYear.get(year)
  if (!holidays) {
    holidays = getBrazilNationalHolidays(year)
    holidaysByYear.set(year, holidays)
  }
  if (holidays.has(date)) return 0
  return schedule[String(getDayOfWeek(date)) as WeekdayKey] ?? 0
}

/**
 * Aplica meta e nível a cada dia. Barato e dependente da jornada atual → roda a cada
 * request (não no cache por userId de fetchHeatmapDays), então mudar a jornada recolore
 * o histórico na hora. Feriados nacionais zeram a meta do dia (getBrazilNationalHolidays).
 */
export function applyHeatmapLevels(
  days: HeatmapRawDay[],
  schedule: WorkMinutesByWeekday
): HeatmapDay[] {
  const useGoal = hasExpectedSchedule(schedule)
  const holidaysByYear = new Map<number, Set<string>>()

  return days.map((day) => {
    const goalMinutes = resolveWorkGoal(day.date, schedule, holidaysByYear)
    const level = useGoal
      ? goalHeatLevel(day.totalMinutes, goalMinutes)
      : absoluteHeatLevel(day.totalMinutes)
    return { ...day, goalMinutes, level }
  })
}

/** Dias da semana crus (antes de meta/nível), como os retorna fetchWeekMinutes. */
export interface WeekMinutes {
  date: string
  weekday: number
  totalMinutes: number
}

/**
 * Enriquece os 7 dias da semana com meta (feriado aplicado) e nível — MESMA escala do
 * heatmap (goalHeatLevel, ou absoluteHeatLevel quando não há jornada prevista). Extraído
 * do route para não duplicar a composição inline e poder ser testado isoladamente.
 */
export function applyWeekLevels<T extends WeekMinutes>(
  days: T[],
  schedule: WorkMinutesByWeekday
): Array<T & { goalMinutes: number; level: HeatmapDay['level'] }> {
  const useGoal = hasExpectedSchedule(schedule)
  const holidaysByYear = new Map<number, Set<string>>()
  return days.map((day) => {
    const goalMinutes = resolveWorkGoal(day.date, schedule, holidaysByYear)
    const level = useGoal
      ? goalHeatLevel(day.totalMinutes, goalMinutes)
      : absoluteHeatLevel(day.totalMinutes)
    return { ...day, goalMinutes, level }
  })
}

/**
 * Preenche o intervalo contíguo [startDate, endDate]: usa o dia real quando existe,
 * senão uma célula vazia (nível 0). Cobre dias/meses futuros (Semestre e Ano exibem
 * o período à frente) e eventuais lacunas de cache do servidor.
 */
export function buildHeatmapRange(
  days: HeatmapDay[],
  startDate: string,
  endDate: string
): HeatmapDay[] {
  if (endDate < startDate) return []
  const byDate = new Map(days.map((day) => [day.date, day]))
  const out: HeatmapDay[] = []
  let cursor = startDate
  while (cursor <= endDate) {
    out.push(
      byDate.get(cursor) ?? {
        date: cursor,
        totalMinutes: 0,
        sessionCount: 0,
        topProject: null,
        goalMinutes: 0,
        level: 0,
      }
    )
    cursor = addDaysToDateString(cursor, 1)
  }
  return out
}
