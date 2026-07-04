import { describe, expect, it } from 'vitest'
import {
  absoluteHeatLevel,
  applyHeatmapLevels,
  buildHeatmapRange,
  goalHeatLevel,
  hasExpectedSchedule,
  type HeatmapRawDay,
} from '../heatmap'
import { addMonthsToMonthKey } from '../dates'
import type { WorkMinutesByWeekday } from '../preferences'
import type { HeatmapDay } from '@/types'

const FULL_TIME: WorkMinutesByWeekday = { '0': 0, '1': 480, '2': 480, '3': 480, '4': 480, '5': 480, '6': 0 }
const NO_SCHEDULE: WorkMinutesByWeekday = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 }

describe('goalHeatLevel', () => {
  it('0 minutos é "sem registro" (0), mesmo com meta', () => {
    expect(goalHeatLevel(0, 480)).toBe(0)
  })
  it('abaixo da meta → 1', () => {
    expect(goalHeatLevel(300, 480)).toBe(1)
  })
  it('na meta → "dentro" (2)', () => {
    expect(goalHeatLevel(480, 480)).toBe(2)
  })
  it('até +10% da meta ainda é "dentro" (2)', () => {
    expect(goalHeatLevel(528, 480)).toBe(2) // 480 × 1,10 = 528
  })
  it('mais de +10% vira "acima" (3)', () => {
    expect(goalHeatLevel(529, 480)).toBe(3)
  })
  it('meta 0 e trabalhou → "acima" (3)', () => {
    expect(goalHeatLevel(120, 0)).toBe(3)
  })
})

describe('absoluteHeatLevel (fallback sem jornada prevista)', () => {
  it('classifica por horas absolutas em 4 níveis', () => {
    expect(absoluteHeatLevel(0)).toBe(0)
    expect(absoluteHeatLevel(120)).toBe(1) // < 4h
    expect(absoluteHeatLevel(300)).toBe(2) // 4h–8h
    expect(absoluteHeatLevel(600)).toBe(3) // 8h+
  })
})

describe('hasExpectedSchedule', () => {
  it('true quando há qualquer meta > 0', () => {
    expect(hasExpectedSchedule(FULL_TIME)).toBe(true)
  })
  it('false quando todas as metas são 0', () => {
    expect(hasExpectedSchedule(NO_SCHEDULE)).toBe(false)
  })
})

describe('applyHeatmapLevels', () => {
  const raw = (date: string, totalMinutes: number): HeatmapRawDay => ({
    date,
    totalMinutes,
    sessionCount: totalMinutes > 0 ? 1 : 0,
    topProject: null,
  })

  it('classifica pela jornada do dia da semana (2026-07-01 é quarta, meta 480)', () => {
    const [day] = applyHeatmapLevels([raw('2026-07-01', 480)], FULL_TIME)
    expect(day.goalMinutes).toBe(480)
    expect(day.level).toBe(2) // dentro
  })

  it('zera a meta em feriado nacional e classifica trabalho como "acima" (2026-09-07 é segunda)', () => {
    const [day] = applyHeatmapLevels([raw('2026-09-07', 300)], FULL_TIME)
    expect(day.goalMinutes).toBe(0)
    expect(day.level).toBe(3) // fora da jornada prevista
  })

  it('fim de semana tem meta 0 (2026-07-04 é sábado)', () => {
    const [day] = applyHeatmapLevels([raw('2026-07-04', 0)], FULL_TIME)
    expect(day.goalMinutes).toBe(0)
    expect(day.level).toBe(0) // 0 min = sem registro
  })

  it('cai no fallback absoluto quando não há jornada prevista', () => {
    const [day] = applyHeatmapLevels([raw('2026-07-01', 300)], NO_SCHEDULE)
    expect(day.goalMinutes).toBe(0)
    expect(day.level).toBe(2) // 4h–8h absoluto
  })
})

describe('buildHeatmapRange', () => {
  const d = (date: string, level: HeatmapDay['level'] = 1): HeatmapDay => ({
    date,
    totalMinutes: level > 0 ? 120 : 0,
    sessionCount: level > 0 ? 1 : 0,
    topProject: null,
    goalMinutes: 480,
    level,
  })

  it('preenche dias futuros com células neutras (nível 0)', () => {
    const range = buildHeatmapRange([d('2026-07-01', 2), d('2026-07-02', 1)], '2026-07-01', '2026-07-05')
    expect(range).toHaveLength(5)
    expect(range[0].level).toBe(2)
    expect(range[1].level).toBe(1)
    expect(range.slice(2).every((x) => x.level === 0 && x.totalMinutes === 0)).toBe(true)
    expect(range[4].date).toBe('2026-07-05')
  })

  it('mantém os dias reais e preenche lacunas anteriores com nível 0', () => {
    const range = buildHeatmapRange([d('2026-07-03', 3)], '2026-07-01', '2026-07-03')
    expect(range).toHaveLength(3)
    expect(range[0].level).toBe(0)
    expect(range[2].level).toBe(3)
  })

  it('retorna vazio quando o fim é anterior ao início', () => {
    expect(buildHeatmapRange([], '2026-07-10', '2026-07-01')).toEqual([])
  })
})

describe('addMonthsToMonthKey', () => {
  it('volta 12 meses para o mesmo mês do ano anterior', () => {
    expect(addMonthsToMonthKey('2026-07', -12)).toBe('2025-07')
  })
  it('atravessa a virada de ano', () => {
    expect(addMonthsToMonthKey('2026-01', -1)).toBe('2025-12')
    expect(addMonthsToMonthKey('2026-12', 1)).toBe('2027-01')
  })
})
