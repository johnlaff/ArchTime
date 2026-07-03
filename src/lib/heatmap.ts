import { addDaysToDateString, getMonthRangeBRT } from './dates'
import type { HeatmapDay } from '@/types'

/**
 * Estende o heatmap com dias vazios (nível 0) até o fim do mês corrente. O servidor
 * só devolve dias até "hoje"; sem o padding a aba Mês mostra o mês pela metade e o
 * react-activity-calendar suprime o label do mês recém-começado nos ranges Semestre/
 * Ano (ele exige ≥3 colunas de semana por mês) — o eixo parecia parado no mês anterior.
 */
export function padHeatmapToMonthEnd(days: HeatmapDay[], today: string): HeatmapDay[] {
  if (days.length === 0) return days
  const lastDate = days[days.length - 1].date
  // Se o cache do servidor estiver alguns minutos atrás do relógio do cliente,
  // ancora no mais recente dos dois para nunca truncar o mês corrente.
  const anchor = lastDate > today ? lastDate : today
  const monthEnd = getMonthRangeBRT(anchor.slice(0, 7)).endDate
  if (lastDate >= monthEnd) return days

  const padded = [...days]
  let cursor = addDaysToDateString(lastDate, 1)
  while (cursor <= monthEnd) {
    padded.push({ date: cursor, totalMinutes: 0, sessionCount: 0, topProject: null, level: 0 })
    cursor = addDaysToDateString(cursor, 1)
  }
  return padded
}
