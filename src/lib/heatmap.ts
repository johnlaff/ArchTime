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
 * Tolerância de "jornada cumprida": bater a meta e ir até +10% ainda conta como
 * "dentro"; acima disso é "acima da jornada". Ancorada no padrão de tolerância de
 * KPI/RAG. Sem folga para baixo de 100% (bater a meta exige atingi-la de fato).
 */
export const MET_TOLERANCE = 1.1

/** true se o usuário tem qualquer meta > 0 na semana (senão, cai no fallback absoluto). */
export function hasExpectedSchedule(schedule: WorkMinutesByWeekday): boolean {
  return WEEKDAY_KEYS.some((key) => (schedule[key] ?? 0) > 0)
}

/**
 * Nível relativo à jornada prevista do dia (4 categorias):
 * 0 sem registro · 1 abaixo · 2 dentro (meta … meta×1,10) · 3 acima.
 * Dia sem meta (feriado/fim de semana/sem jornada) trabalhado cai em "acima".
 */
export function goalHeatLevel(minutes: number, goalMinutes: number): HeatmapDay['level'] {
  if (minutes < 1) return 0
  if (goalMinutes <= 0) return 3
  if (minutes < goalMinutes) return 1
  if (minutes <= Math.round(goalMinutes * MET_TOLERANCE)) return 2
  return 3
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
    const year = Number(day.date.slice(0, 4))
    let holidays = holidaysByYear.get(year)
    if (!holidays) {
      holidays = getBrazilNationalHolidays(year)
      holidaysByYear.set(year, holidays)
    }
    const goalMinutes = holidays.has(day.date)
      ? 0
      : schedule[String(getDayOfWeek(day.date)) as WeekdayKey] ?? 0
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
