import { describe, expect, it } from 'vitest'
import {
  parseSettingsPatch,
  settingsOptions,
} from '../user-settings'

describe('parseSettingsPatch', () => {
  it('applies a known template and fills weekday minutes automatically', () => {
    const patch = parseSettingsPatch({ workScheduleTemplate: 'pj_30h' })

    expect(patch).toMatchObject({
      workScheduleTemplate: 'pj_30h',
      workMinutesByWeekday: {
        '0': 0,
        '1': 360,
        '2': 360,
        '3': 360,
        '4': 360,
        '5': 360,
        '6': 0,
      },
    })
  })

  it('marks manually edited schedules as custom', () => {
    const patch = parseSettingsPatch({
      workMinutesByWeekday: {
        '0': 0,
        '1': 420,
        '2': 360,
        '3': 360,
        '4': 360,
        '5': 360,
        '6': 0,
      },
    })

    expect(patch).toMatchObject({
      workScheduleTemplate: 'custom',
      workMinutesByWeekday: expect.objectContaining({ '1': 420 }),
    })
  })

  it('rejects invalid weekday minutes', () => {
    const patch = parseSettingsPatch({
      workMinutesByWeekday: {
        '0': 0,
        '1': 1500,
        '2': 360,
        '3': 360,
        '4': 360,
        '5': 360,
        '6': 0,
      },
    })

    expect(patch).toBe('Jornada semanal inválida')
  })

  it('rejects unknown visual presets and cumulative scopes', () => {
    expect(parseSettingsPatch({ accentPreset: 'neon' })).toBe('Preset visual inválido')
    expect(parseSettingsPatch({ cumulativeBalanceScope: 'forever' })).toBe(
      'Dimensão do acumulado inválida'
    )
  })

  it('rejects impossible cumulative start dates', () => {
    expect(parseSettingsPatch({ cumulativeStartDate: '2026-02-31' })).toBe(
      'Data inicial do acumulado inválida'
    )
  })

  it('exposes all supported cumulative scopes to the UI', () => {
    expect(Object.keys(settingsOptions.cumulativeBalanceScopes)).toEqual([
      'since_start',
      'year_to_date',
      'rolling_3_months',
      'rolling_6_months',
      'rolling_12_months',
    ])
  })
})
