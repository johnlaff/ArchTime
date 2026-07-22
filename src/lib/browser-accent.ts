import {
  ACCENT_PRESETS,
  ARCHITECTURAL_PRESETS,
  type AccentPreset,
  type ArchitecturalPreset,
} from '@/lib/preferences'
import {
  getBrowserAccentIconUrl,
  getColorInputValue,
  getReadableCustomForeground,
} from '@/lib/custom-color'

interface EffectiveBrowserAccentInput {
  accent: AccentPreset | 'custom'
  customColor: string | null
  architecturalPreset: ArchitecturalPreset | null
}

let activeBrowserAccentColor: string | null = null
let browserAccentTimers: number[] = []

export function getEffectiveBrowserAccentColor({
  accent,
  customColor,
  architecturalPreset,
}: EffectiveBrowserAccentInput): string {
  if (architecturalPreset) return ARCHITECTURAL_PRESETS[architecturalPreset].color
  if (accent === 'custom') return getColorInputValue(customColor)
  return ACCENT_PRESETS[accent].color
}

function clearBrowserAccentTimers() {
  for (const timer of browserAccentTimers) window.clearTimeout(timer)
  browserAccentTimers = []
}

function makeFaviconDataUrl(color: string): string {
  const fg = getReadableCustomForeground(color)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="7" fill="${color}"/>` +
    `<g transform="translate(6.08 6.08) scale(0.1984)" fill="none" stroke-linecap="round">` +
    `<circle cx="50" cy="13" r="6.5" fill="${fg}"/>` +
    `<line x1="50" y1="13" x2="13" y2="87" stroke="${fg}" stroke-width="9.5"/>` +
    `<line x1="50" y1="13" x2="87" y2="87" stroke="${fg}" stroke-width="9.5"/>` +
    `<line x1="27" y1="60" x2="73" y2="60" stroke="${fg}" stroke-width="6.5"/>` +
    `<path d="M 13 87 A 82 82 0 0 1 87 87" stroke="${fg}" stroke-width="3.5" stroke-dasharray="5 4" opacity="0.55"/>` +
    `</g></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function updateBrowserAccentLinks(color: string) {
  if (typeof document === 'undefined') return

  for (const icon of Array.from(document.head.querySelectorAll('link[rel="icon"]'))) {
    icon.remove()
  }

  const icon = document.createElement('link')
  icon.rel = 'icon'
  icon.type = 'image/svg+xml'
  icon.sizes = '32x32'
  icon.href = makeFaviconDataUrl(color)
  document.head.appendChild(icon)

  let apple = document.head.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null
  if (!apple) {
    apple = document.createElement('link')
    apple.rel = 'apple-touch-icon'
    apple.sizes = '192x192'
    document.head.appendChild(apple)
  }
  apple.href = getBrowserAccentIconUrl(color, 192)

  // O manifest é buscado pelo browser sem credenciais, então a cor precisa ir na
  // URL — é ela que define o ícone de instalação e o theme_color do app instalado.
  let manifest = document.head.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
  if (!manifest) {
    manifest = document.createElement('link')
    manifest.rel = 'manifest'
    document.head.appendChild(manifest)
  }
  manifest.href = `/manifest.json?color=${encodeURIComponent(color)}`
}

export function syncBrowserAccentColor(hex: string) {
  if (typeof document === 'undefined') return

  const color = getColorInputValue(hex)
  activeBrowserAccentColor = color
  clearBrowserAccentTimers()
  document.cookie = `archtime-accent-color=${color};path=/;max-age=31536000;SameSite=Lax`
  updateBrowserAccentLinks(color)

  for (const delay of [0, 250]) {
    browserAccentTimers.push(
      window.setTimeout(() => {
        if (activeBrowserAccentColor === color) updateBrowserAccentLinks(color)
      }, delay)
    )
  }
}
