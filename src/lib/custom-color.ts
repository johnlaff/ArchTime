const HEX_COLOR_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i
export const DEFAULT_CUSTOM_ACCENT = '#6366f1'
export const CUSTOM_FOREGROUND_DARK = '#111827'
export const CUSTOM_FOREGROUND_LIGHT = '#ffffff'

export function normalizeHexColor(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null

  const match = raw.match(HEX_COLOR_RE)
  if (!match) return null

  const hex = match[1].toLowerCase()
  if (hex.length === 3) {
    return `#${hex.split('').map((char) => `${char}${char}`).join('')}`
  }

  return `#${hex}`
}

export function getColorInputValue(value: string | null | undefined): string {
  return normalizeHexColor(value) ?? DEFAULT_CUSTOM_ACCENT
}

function relativeLuminance(hex: string): number {
  const normalized = getColorInputValue(hex).slice(1)
  const channels = [0, 2, 4].map((start) => {
    const value = Number.parseInt(normalized.slice(start, start + 2), 16) / 255
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4)
  })

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

export function getReadableCustomForeground(hex: string | null | undefined): string {
  return relativeLuminance(getColorInputValue(hex)) > 0.45
    ? CUSTOM_FOREGROUND_DARK
    : CUSTOM_FOREGROUND_LIGHT
}

export interface HslColor {
  h: number
  s: number
  l: number
}

export function hexToHsl(hex: string | null | undefined): HslColor {
  const normalized = getColorInputValue(hex).slice(1)
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2

  if (delta === 0) return { h: 0, s: 0, l: Math.round(l * 100) }

  const s = delta / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (max === r) h = 60 * (((g - b) / delta) % 6)
  else if (max === g) h = 60 * ((b - r) / delta + 2)
  else h = 60 * ((r - g) / delta + 4)

  return {
    h: Math.round((h + 360) % 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

export function hslToHex({ h, s, l }: HslColor): string {
  const normalizedHue = ((h % 360) + 360) % 360
  const saturation = Math.max(0, Math.min(100, s)) / 100
  const lightness = Math.max(0, Math.min(100, l)) / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1))
  const match = lightness - chroma / 2
  const [r1, g1, b1] =
    normalizedHue < 60 ? [chroma, x, 0] :
    normalizedHue < 120 ? [x, chroma, 0] :
    normalizedHue < 180 ? [0, chroma, x] :
    normalizedHue < 240 ? [0, x, chroma] :
    normalizedHue < 300 ? [x, 0, chroma] :
    [chroma, 0, x]

  return `#${[r1, g1, b1].map((channel) => {
    const value = Math.round((channel + match) * 255)
    return value.toString(16).padStart(2, '0')
  }).join('')}`
}
