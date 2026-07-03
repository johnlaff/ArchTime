import { describe, expect, it } from 'vitest'
import { padHeatmapToMonthEnd } from '../heatmap'
import type { HeatmapDay } from '@/types'

function day(date: string, totalMinutes = 0): HeatmapDay {
  return {
    date,
    totalMinutes,
    sessionCount: totalMinutes > 0 ? 1 : 0,
    topProject: totalMinutes > 0 ? 'Projeto' : null,
    level: totalMinutes > 0 ? 1 : 0,
  }
}

describe('padHeatmapToMonthEnd', () => {
  it('completa o mês corrente com dias vazios após o último registro', () => {
    const days = [day('2026-07-01', 120), day('2026-07-02', 60), day('2026-07-03')]
    const padded = padHeatmapToMonthEnd(days, '2026-07-03')

    expect(padded).toHaveLength(31)
    expect(padded[padded.length - 1].date).toBe('2026-07-31')
    expect(padded.slice(3).every((d) => d.totalMinutes === 0 && d.level === 0)).toBe(true)
    expect(padded.slice(3).every((d) => d.sessionCount === 0 && d.topProject === null)).toBe(true)
  })

  it('preserva os dias originais e não muta o array de entrada', () => {
    const days = [day('2026-07-01', 120)]
    const padded = padHeatmapToMonthEnd(days, '2026-07-01')

    expect(days).toHaveLength(1)
    expect(padded[0]).toBe(days[0])
  })

  it('retorna o array como está quando o mês já termina completo', () => {
    const days = [day('2026-06-29'), day('2026-06-30', 45)]
    expect(padHeatmapToMonthEnd(days, '2026-06-30')).toBe(days)
  })

  it('ancora em "hoje" quando o cache do servidor está atrasado em outro mês', () => {
    // Servidor parou em 30/jun (cache), mas o cliente já está em 2/jul:
    // o padding precisa atravessar a virada e cobrir julho inteiro.
    const days = [day('2026-06-30', 30)]
    const padded = padHeatmapToMonthEnd(days, '2026-07-02')

    expect(padded[1].date).toBe('2026-07-01')
    expect(padded[padded.length - 1].date).toBe('2026-07-31')
    expect(padded).toHaveLength(1 + 31)
  })

  it('ancora no último dia do servidor se ele estiver à frente do cliente', () => {
    const days = [day('2026-08-01')]
    const padded = padHeatmapToMonthEnd(days, '2026-07-31')

    expect(padded[padded.length - 1].date).toBe('2026-08-31')
  })

  it('devolve vazio para entrada vazia', () => {
    expect(padHeatmapToMonthEnd([], '2026-07-03')).toEqual([])
  })
})
