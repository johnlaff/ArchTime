import { describe, expect, it } from 'vitest'
import {
  CUSTOM_FOREGROUND_DARK,
  CUSTOM_FOREGROUND_LIGHT,
  getBrowserAccentIconUrl,
  getColorInputValue,
  getContrastRatio,
  getCustomAccentTokens,
  getReadableCustomForeground,
  normalizeHexColor,
} from '../custom-color'

describe('custom accent color helpers', () => {
  it('normalizes 3 and 6 digit hex colors for storage and CSS', () => {
    expect(normalizeHexColor('#6366F1')).toBe('#6366f1')
    expect(normalizeHexColor('6366f1')).toBe('#6366f1')
    expect(normalizeHexColor('#0AF')).toBe('#00aaff')
    expect(normalizeHexColor('abc')).toBe('#aabbcc')
  })

  it('rejects invalid custom color values', () => {
    expect(normalizeHexColor('')).toBeNull()
    expect(normalizeHexColor('#12')).toBeNull()
    expect(normalizeHexColor('#12345g')).toBeNull()
    expect(normalizeHexColor('var(--primary)')).toBeNull()
  })

  it('returns a safe value for native color inputs', () => {
    expect(getColorInputValue('#F43F5E')).toBe('#f43f5e')
    expect(getColorInputValue(null)).toBe('#6366f1')
    expect(getColorInputValue('nope')).toBe('#6366f1')
  })

  it('chooses readable logo foreground colors for very light and very dark custom colors', () => {
    expect(getReadableCustomForeground('#ffffff')).toBe(CUSTOM_FOREGROUND_DARK)
    expect(getReadableCustomForeground('#f8fafc')).toBe(CUSTOM_FOREGROUND_DARK)
    expect(getReadableCustomForeground('#000000')).toBe(CUSTOM_FOREGROUND_LIGHT)
    expect(getReadableCustomForeground('#111827')).toBe(CUSTOM_FOREGROUND_LIGHT)
  })

  it('generates contrast-safe soft accent tokens for extreme custom colors', () => {
    const black = getCustomAccentTokens('#000000')
    const white = getCustomAccentTokens('#ffffff')

    expect(black.accentDark).not.toBe('#000000')
    expect(getContrastRatio(black.accentDark, black.accentForegroundDark)).toBeGreaterThanOrEqual(4.5)
    expect(getContrastRatio(black.accentLight, black.accentForegroundLight)).toBeGreaterThanOrEqual(4.5)

    expect(white.primaryBorder).not.toBe('transparent')
    expect(getContrastRatio('#ffffff', white.primaryBorder)).toBeGreaterThanOrEqual(1.5)
    expect(getContrastRatio(white.accentLight, white.accentForegroundLight)).toBeGreaterThanOrEqual(4.5)
  })

  it('builds browser icon URLs that force a refresh for the active accent color', () => {
    expect(getBrowserAccentIconUrl('#ffffff', 32)).toBe('/api/icon?size=32&color=%23ffffff&v=ffffff')
    expect(getBrowserAccentIconUrl('not-a-color', 192)).toBe('/api/icon?size=192&color=%236366f1&v=6366f1')
  })
})
