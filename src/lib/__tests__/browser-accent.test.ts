import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getEffectiveBrowserAccentColor,
  syncBrowserAccentColor,
} from '../browser-accent'

describe('browser accent color sync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.head.innerHTML = ''
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    document.head.innerHTML = ''
  })

  it('uses the architectural preset color while a preset is active', () => {
    expect(
      getEffectiveBrowserAccentColor({
        accent: 'rose',
        customColor: null,
        architecturalPreset: 'vegetacao',
      })
    ).toBe('#2d7a4f')

    expect(
      getEffectiveBrowserAccentColor({
        accent: 'rose',
        customColor: null,
        architecturalPreset: null,
      })
    ).toBe('#f43f5e')
  })

  it('cancels stale scheduled favicon updates when the effective color changes', () => {
    syncBrowserAccentColor('#f43f5e')
    syncBrowserAccentColor('#2d7a4f')

    vi.runAllTimers()

    const icons = Array.from(document.head.querySelectorAll('link[rel="icon"]'))
    expect(icons).toHaveLength(1)
    expect(icons[0].getAttribute('href')).toBe('/api/icon?size=32&color=%232d7a4f&v=2d7a4f')
    expect(document.head.innerHTML).not.toContain('%23f43f5e')
  })
})
