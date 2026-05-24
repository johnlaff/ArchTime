import {
  ACCENT_PRESETS,
  ARCHITECTURAL_PRESETS,
  type AccentPreset,
  type ArchitecturalPreset,
} from '@/lib/preferences'
import {
  getBrowserAccentIconUrl,
  getColorInputValue,
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

function updateBrowserAccentLinks(color: string) {
  if (typeof document === 'undefined') return

  for (const icon of Array.from(document.head.querySelectorAll('link[rel="icon"]'))) {
    icon.remove()
  }

  const icon = document.createElement('link')
  icon.rel = 'icon'
  icon.type = 'image/png'
  icon.sizes = '32x32'
  icon.href = getBrowserAccentIconUrl(color, 32)
  document.head.appendChild(icon)

  let apple = document.head.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null
  if (!apple) {
    apple = document.createElement('link')
    apple.rel = 'apple-touch-icon'
    apple.sizes = '192x192'
    document.head.appendChild(apple)
  }
  apple.href = getBrowserAccentIconUrl(color, 192)

  let themeColor = document.head.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (!themeColor) {
    themeColor = document.createElement('meta')
    themeColor.name = 'theme-color'
    document.head.appendChild(themeColor)
  }
  themeColor.content = color
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
