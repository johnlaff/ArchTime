'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { markLocalPreferenceChange } from '@/lib/appearance'
import {
  ACCENT_PRESETS,
  ARCHITECTURAL_PRESETS,
  isArchitecturalPreset,
  isDensityPreset,
  type AccentPreset,
  type ArchitecturalPreset,
  type DensityPreset,
} from '@/lib/preferences'
import {
  getBrowserAccentIconUrl,
  getColorInputValue,
  getCustomAccentTokens,
  normalizeHexColor,
} from '@/lib/custom-color'

export const ACCENTS = Object.fromEntries(
  Object.entries(ACCENT_PRESETS).map(([key, preset]) => [key, preset.color])
) as Record<AccentPreset, string>

const PRESET_KEY = 'archtime-preset'
const DENSITY_KEY = 'archtime-density'
const CUSTOM_COLOR_KEY = 'archtime-accent-custom'
const CUSTOM_ACCENT_PROPERTIES = [
  '--custom-accent-hex',
  '--custom-accent-foreground',
  '--custom-accent-border',
  '--custom-accent-soft-light',
  '--custom-accent-soft-foreground-light',
  '--custom-accent-muted-light',
  '--custom-accent-soft-dark',
  '--custom-accent-soft-foreground-dark',
  '--custom-accent-muted-dark',
]

interface AccentColorContextValue {
  accent: AccentPreset | 'custom'
  setAccent: (a: AccentPreset) => void
  customColor: string | null
  setCustomColor: (hex: string) => void
  architecturalPreset: ArchitecturalPreset | null
  setArchitecturalPreset: (p: ArchitecturalPreset | null) => void
  density: DensityPreset
  setDensity: (d: DensityPreset) => void
}

const AccentColorContext = createContext<AccentColorContextValue>({
  accent: 'indigo',
  setAccent: () => {},
  customColor: null,
  setCustomColor: () => {},
  architecturalPreset: null,
  setArchitecturalPreset: () => {},
  density: 'cozy',
  setDensity: () => {},
})

function applyCustomAccentProperties(hex: string) {
  const tokens = getCustomAccentTokens(hex)
  const root = document.documentElement
  root.style.setProperty('--custom-accent-hex', tokens.primary)
  root.style.setProperty('--custom-accent-foreground', tokens.primaryForeground)
  root.style.setProperty('--custom-accent-border', tokens.primaryBorder)
  root.style.setProperty('--custom-accent-soft-light', tokens.accentLight)
  root.style.setProperty('--custom-accent-soft-foreground-light', tokens.accentForegroundLight)
  root.style.setProperty('--custom-accent-muted-light', tokens.mutedLight)
  root.style.setProperty('--custom-accent-soft-dark', tokens.accentDark)
  root.style.setProperty('--custom-accent-soft-foreground-dark', tokens.accentForegroundDark)
  root.style.setProperty('--custom-accent-muted-dark', tokens.mutedDark)
}

function clearCustomAccentProperties() {
  for (const property of CUSTOM_ACCENT_PROPERTIES) {
    document.documentElement.style.removeProperty(property)
  }
}

function updateBrowserAccentLinks(color: string) {
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

function syncBrowserAccentColor(hex: string) {
  const color = getColorInputValue(hex)
  document.cookie = `archtime-accent-color=${color};path=/;max-age=31536000;SameSite=Lax`
  updateBrowserAccentLinks(color)
  window.setTimeout(updateBrowserAccentLinks, 0, color)
  window.setTimeout(updateBrowserAccentLinks, 250, color)
}

export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentPreset | 'custom'>('indigo')
  const [customColor, setCustomColorState] = useState<string | null>(null)
  const [architecturalPreset, setArchitecturalPresetState] = useState<ArchitecturalPreset | null>(null)
  const [density, setDensityState] = useState<DensityPreset>('cozy')

  useEffect(() => {
    const savedAccent = localStorage.getItem('archtime-accent')
    let activeBrowserColor: string = ACCENTS.indigo
    if (savedAccent === 'custom') {
      setAccentState('custom')
      const savedCustom = getColorInputValue(localStorage.getItem(CUSTOM_COLOR_KEY))
      setCustomColorState(savedCustom)
      applyCustomAccentProperties(savedCustom)
      activeBrowserColor = savedCustom
    } else if (savedAccent && Object.hasOwn(ACCENT_PRESETS, savedAccent)) {
      setAccentState(savedAccent as AccentPreset)
      activeBrowserColor = ACCENTS[savedAccent as AccentPreset]
    }

    const savedPreset = localStorage.getItem(PRESET_KEY)
    if (savedPreset && isArchitecturalPreset(savedPreset)) {
      setArchitecturalPresetState(savedPreset)
      activeBrowserColor = ARCHITECTURAL_PRESETS[savedPreset].color
    }

    syncBrowserAccentColor(activeBrowserColor)

    const savedDensity = localStorage.getItem(DENSITY_KEY)
    if (savedDensity && isDensityPreset(savedDensity)) setDensityState(savedDensity)
  }, [])

  function setAccent(newAccent: AccentPreset) {
    markLocalPreferenceChange()
    setAccentState(newAccent)
    setCustomColorState(null)
    document.documentElement.setAttribute('data-accent', newAccent)
    clearCustomAccentProperties()
    localStorage.setItem('archtime-accent', newAccent)
    localStorage.removeItem(CUSTOM_COLOR_KEY)
    if (!architecturalPreset) {
      const color = ACCENTS[newAccent]
      syncBrowserAccentColor(color)
    }
  }

  function setCustomColor(hex: string) {
    const normalized = normalizeHexColor(hex)
    if (!normalized) return
    markLocalPreferenceChange()
    setAccentState('custom')
    setCustomColorState(normalized)
    document.documentElement.setAttribute('data-accent', 'custom')
    applyCustomAccentProperties(normalized)
    localStorage.setItem('archtime-accent', 'custom')
    localStorage.setItem(CUSTOM_COLOR_KEY, normalized)
    if (!architecturalPreset) {
      syncBrowserAccentColor(normalized)
    }
  }

  function setArchitecturalPreset(preset: ArchitecturalPreset | null) {
    markLocalPreferenceChange()
    setArchitecturalPresetState(preset)
    if (preset) {
      document.documentElement.setAttribute('data-preset', preset)
      localStorage.setItem(PRESET_KEY, preset)
      const color = ARCHITECTURAL_PRESETS[preset].color
      syncBrowserAccentColor(color)
    } else {
      document.documentElement.removeAttribute('data-preset')
      localStorage.removeItem(PRESET_KEY)
      const color = accent === 'custom' ? getColorInputValue(customColor) : ACCENTS[accent]
      syncBrowserAccentColor(color)
    }
  }

  function setDensity(newDensity: DensityPreset) {
    markLocalPreferenceChange()
    setDensityState(newDensity)
    document.documentElement.setAttribute('data-density', newDensity)
    localStorage.setItem(DENSITY_KEY, newDensity)
  }

  return (
    <AccentColorContext.Provider
      value={{ accent, setAccent, customColor, setCustomColor, architecturalPreset, setArchitecturalPreset, density, setDensity }}
    >
      {children}
    </AccentColorContext.Provider>
  )
}

export function useAccentColor() {
  return useContext(AccentColorContext)
}
