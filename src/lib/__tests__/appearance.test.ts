import { describe, expect, it } from 'vitest'
import {
  getNextThemeMode,
  shouldApplyRemotePreferences,
} from '../appearance'

describe('appearance preferences', () => {
  it('toggles from the resolved theme instead of the stored theme mode', () => {
    expect(getNextThemeMode('dark')).toBe('light')
    expect(getNextThemeMode('light')).toBe('dark')
  })

  it('does not apply stale remote preferences shortly after a local visual change', () => {
    expect(shouldApplyRemotePreferences(20_000, 15_000)).toBe(false)
  })

  it('applies remote preferences when there was no recent local visual change', () => {
    expect(shouldApplyRemotePreferences(20_000, 5_000)).toBe(true)
    expect(shouldApplyRemotePreferences(20_000, null)).toBe(true)
  })
})
