import { describe, expect, it } from 'vitest'
import {
  absoluteHeatLevel,
  applyHeatmapLevels,
  applyWeekLevels,
  buildHeatmapRange,
  goalHeatLevel,
  hasExpectedSchedule,
  heatLevelColor,
  heatLevelLabel,
  resolveWorkGoal,
  type HeatmapRawDay,
} from '../heatmap'
import { addMonthsToMonthKey, anoWindowStartKey, HEATMAP_YEAR_MONTHS } from '../dates'
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
  it('na meta exata → "dentro" (2)', () => {
    expect(goalHeatLevel(480, 480)).toBe(2)
  })
  it('1 minuto acima da meta já é "acima" (3) — sem tolerância', () => {
    expect(goalHeatLevel(481, 480)).toBe(3)
  })
  it('bem acima da meta → "acima" (3)', () => {
    expect(goalHeatLevel(600, 480)).toBe(3)
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

describe('applyWeekLevels (barras semanais, mesma escala do heatmap)', () => {
  const wm = (date: string, weekday: number, totalMinutes: number) => ({ date, weekday, totalMinutes })

  it('nível relativo à jornada; feriado numa segunda zera a meta e vira "acima"', () => {
    const [seg, feriado] = applyWeekLevels(
      [wm('2026-06-29', 1, 480), wm('2026-09-07', 1, 300)], // segunda comum · Independência (segunda)
      FULL_TIME
    )
    expect(seg.goalMinutes).toBe(480)
    expect(seg.level).toBe(2) // dentro
    expect(feriado.goalMinutes).toBe(0)
    expect(feriado.level).toBe(3) // fora da jornada
  })

  it('fallback absoluto quando não há jornada prevista (meta 0 em todos, nível por horas)', () => {
    const days = applyWeekLevels(
      [wm('2026-06-29', 1, 120), wm('2026-06-30', 2, 300), wm('2026-07-01', 3, 540)],
      NO_SCHEDULE
    )
    expect(days.map((d) => d.level)).toEqual([1, 2, 3]) // <4h · 4–8h · 8h+
    expect(days.every((d) => d.goalMinutes === 0)).toBe(true)
  })
})

describe('resolveWorkGoal (meta do dia, com feriado)', () => {
  const cache = () => new Map<number, Set<string>>()
  it('retorna a meta do dia da semana em dia útil comum (2026-07-01, quarta)', () => {
    expect(resolveWorkGoal('2026-07-01', FULL_TIME, cache())).toBe(480)
  })
  it('zera em feriado nacional (2026-09-07, Independência, cai numa segunda)', () => {
    expect(resolveWorkGoal('2026-09-07', FULL_TIME, cache())).toBe(0)
  })
  it('zera no fim de semana (sábado, meta 0 no template)', () => {
    expect(resolveWorkGoal('2026-07-04', FULL_TIME, cache())).toBe(0)
  })
})

describe('heatLevelColor / heatLevelLabel (escala compartilhada)', () => {
  it('4 níveis distintos, todos via color-mix sobre tokens de tema', () => {
    const colors = ([0, 1, 2, 3] as const).map((l) => heatLevelColor(l))
    expect(new Set(colors).size).toBe(4)
    expect(colors.every((c) => c.includes('color-mix'))).toBe(true)
  })
  it('rótulos das 3 categorias com registro', () => {
    expect(heatLevelLabel(1)).toBe('abaixo da jornada')
    expect(heatLevelLabel(2)).toBe('dentro da jornada')
    expect(heatLevelLabel(3)).toBe('acima da jornada')
  })
})

describe('anoWindowStartKey (aba Ano = 12 meses terminando no mês vigente)', () => {
  it('exibe 12 meses: começa 11 meses antes do mês vigente', () => {
    expect(HEATMAP_YEAR_MONTHS).toBe(12)
    expect(anoWindowStartKey('2026-07')).toBe('2025-08') // ago/2025 … jul/2026 = 12 meses
  })
  it('atravessa a virada de ano', () => {
    expect(anoWindowStartKey('2026-01')).toBe('2025-02') // fev/2025 … jan/2026 = 12 meses
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
