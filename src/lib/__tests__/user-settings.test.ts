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

  it('accepts valid weekStartDay values', () => {
    expect(parseSettingsPatch({ weekStartDay: 'monday' })).toMatchObject({ weekStartDay: 'monday' })
    expect(parseSettingsPatch({ weekStartDay: 'sunday' })).toMatchObject({ weekStartDay: 'sunday' })
  })

  it('rejects invalid weekStartDay values', () => {
    expect(parseSettingsPatch({ weekStartDay: 'saturday' })).toBe('Dia de início de semana inválido')
    expect(parseSettingsPatch({ weekStartDay: 42 })).toBe('Dia de início de semana inválido')
  })

  it('accepts a valid architectural preset and null to clear it', () => {
    expect(parseSettingsPatch({ architecturalPreset: 'concreto' })).toMatchObject({ architecturalPreset: 'concreto' })
    expect(parseSettingsPatch({ architecturalPreset: null })).toMatchObject({ architecturalPreset: null })
  })

  it('rejects an invalid architectural preset', () => {
    expect(parseSettingsPatch({ architecturalPreset: 'brutalismo' })).toBe('Preset arquitetônico inválido')
  })

  it('accepts a valid density and rejects an invalid one', () => {
    expect(parseSettingsPatch({ density: 'compact' })).toMatchObject({ density: 'compact' })
    expect(parseSettingsPatch({ density: 'gigante' })).toBe('Densidade inválida')
  })

  it('preserves accent and theme through parse (regression: both still round-trip)', () => {
    expect(parseSettingsPatch({ accentPreset: 'rose' })).toMatchObject({ accentPreset: 'rose' })
    expect(parseSettingsPatch({ themeMode: 'dark' })).toMatchObject({ themeMode: 'dark' })
  })

  it('accepts accentPreset "custom" and a valid custom color', () => {
    expect(parseSettingsPatch({ accentPreset: 'custom' })).toMatchObject({ accentPreset: 'custom' })
    expect(parseSettingsPatch({ customAccentColor: '#AB12CD' })).toMatchObject({ customAccentColor: '#ab12cd' })
    expect(parseSettingsPatch({ customAccentColor: null })).toMatchObject({ customAccentColor: null })
  })

  it('rejects an invalid custom color (string or non-string)', () => {
    expect(parseSettingsPatch({ customAccentColor: 'not-a-color' })).toBe('Cor personalizada inválida')
    // Non-string values must return an error, not throw a TypeError (Copilot #2 regression)
    expect(parseSettingsPatch({ customAccentColor: 42 as unknown as string })).toBe('Cor personalizada inválida')
    expect(parseSettingsPatch({ customAccentColor: {} as unknown as string })).toBe('Cor personalizada inválida')
  })
})
