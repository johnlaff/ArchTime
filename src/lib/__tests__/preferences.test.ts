import {
  ACCENT_PRESETS,
  ARCHITECTURAL_PRESETS,
  DENSITY_PRESETS,
  isAccentPreset,
  isArchitecturalPreset,
  isDensityPreset,
} from '../preferences'

describe('ACCENT_PRESETS', () => {
  const all13 = [
    'indigo', 'violet', 'lavender', 'fuchsia',
    'rose', 'ruby', 'coral', 'amber',
    'emerald', 'teal', 'cyan', 'blue', 'slate',
  ]

  it('contains exactly 13 presets', () => {
    expect(Object.keys(ACCENT_PRESETS)).toHaveLength(13)
    expect(Object.keys(ACCENT_PRESETS)).toEqual(expect.arrayContaining(all13))
  })

  it('every preset has label, color, and full css object', () => {
    for (const [key, p] of Object.entries(ACCENT_PRESETS)) {
      expect(p, `${key} label`).toHaveProperty('label')
      expect(p, `${key} color`).toHaveProperty('color')
      expect(p.css, `${key} primary`).toHaveProperty('primary')
      expect(p.css, `${key} primaryDark`).toHaveProperty('primaryDark')
      expect(p.css, `${key} accent`).toHaveProperty('accent')
      expect(p.css, `${key} accentDark`).toHaveProperty('accentDark')
      expect(p.css, `${key} muted`).toHaveProperty('muted')
      expect(p.css, `${key} mutedDark`).toHaveProperty('mutedDark')
    }
  })

  it('isAccentPreset rejects non-accent keys', () => {
    for (const k of all13) expect(isAccentPreset(k)).toBe(true)
    expect(isAccentPreset('concreto')).toBe(false)
    expect(isAccentPreset('')).toBe(false)
    expect(isAccentPreset(null)).toBe(false)
  })
})

describe('ARCHITECTURAL_PRESETS', () => {
  const all5 = ['concreto', 'terracota', 'linha-tecnica', 'vegetacao', 'aurora']

  it('contains exactly 5 presets', () => {
    expect(Object.keys(ARCHITECTURAL_PRESETS)).toHaveLength(5)
    expect(Object.keys(ARCHITECTURAL_PRESETS)).toEqual(expect.arrayContaining(all5))
  })

  it('every preset has label, color, description', () => {
    for (const [key, p] of Object.entries(ARCHITECTURAL_PRESETS)) {
      expect(p, `${key} label`).toHaveProperty('label')
      expect(p, `${key} color`).toHaveProperty('color')
      expect(p, `${key} description`).toHaveProperty('description')
    }
  })

  it('isArchitecturalPreset guards correctly', () => {
    for (const k of all5) expect(isArchitecturalPreset(k)).toBe(true)
    expect(isArchitecturalPreset('indigo')).toBe(false)
    expect(isArchitecturalPreset(null)).toBe(false)
  })
})

describe('DENSITY_PRESETS', () => {
  it('contains compact, cozy, spacious', () => {
    expect(Object.keys(DENSITY_PRESETS)).toEqual(
      expect.arrayContaining(['compact', 'cozy', 'spacious'])
    )
  })

  it('isDensityPreset guards correctly', () => {
    expect(isDensityPreset('compact')).toBe(true)
    expect(isDensityPreset('cozy')).toBe(true)
    expect(isDensityPreset('spacious')).toBe(true)
    expect(isDensityPreset('large')).toBe(false)
    expect(isDensityPreset(null)).toBe(false)
  })
})
