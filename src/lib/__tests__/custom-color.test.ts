import { describe, expect, it } from 'vitest'
import { getColorInputValue, normalizeHexColor } from '../custom-color'

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
})
