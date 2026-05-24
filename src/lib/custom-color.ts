const HEX_COLOR_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i
export const DEFAULT_CUSTOM_ACCENT = '#6366f1'

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
