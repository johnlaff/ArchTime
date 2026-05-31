'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { markLocalPreferenceChange, persistAppearanceSettings, type AppearancePatch } from '@/lib/appearance'
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
  getColorInputValue,
  getCustomAccentTokens,
  normalizeHexColor,
} from '@/lib/custom-color'
import {
  getEffectiveBrowserAccentColor,
  syncBrowserAccentColor,
} from '@/lib/browser-accent'

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
  syncAccentFromRemote: (a: AccentPreset) => void
  customColor: string | null
  setCustomColor: (hex: string) => void
  architecturalPreset: ArchitecturalPreset | null
  setArchitecturalPreset: (p: ArchitecturalPreset | null) => void
  density: DensityPreset
  setDensity: (d: DensityPreset) => void
  syncAppearanceFromRemote: (patch: { architecturalPreset?: ArchitecturalPreset | null; density?: DensityPreset }) => void
}

const AccentColorContext = createContext<AccentColorContextValue>({
  accent: 'indigo',
  setAccent: () => {},
  syncAccentFromRemote: () => {},
  customColor: null,
  setCustomColor: () => {},
  architecturalPreset: null,
  setArchitecturalPreset: () => {},
  density: 'cozy',
  setDensity: () => {},
  syncAppearanceFromRemote: () => {},
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

export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentPreset | 'custom'>('indigo')
  const [customColor, setCustomColorState] = useState<string | null>(null)
  const [architecturalPreset, setArchitecturalPresetState] = useState<ArchitecturalPreset | null>(null)
  const [density, setDensityState] = useState<DensityPreset>('cozy')

  useEffect(() => {
    const savedAccent = localStorage.getItem('archtime-accent')
    let initialAccent: AccentPreset | 'custom' = 'indigo'
    let initialCustomColor: string | null = null
    let initialPreset: ArchitecturalPreset | null = null

    if (savedAccent === 'custom') {
      initialAccent = 'custom'
      const savedCustom = getColorInputValue(localStorage.getItem(CUSTOM_COLOR_KEY))
      initialCustomColor = savedCustom
      setAccentState('custom')
      setCustomColorState(savedCustom)
      applyCustomAccentProperties(savedCustom)
    } else if (savedAccent && Object.hasOwn(ACCENT_PRESETS, savedAccent)) {
      initialAccent = savedAccent as AccentPreset
      setAccentState(initialAccent)
    }

    const savedPreset = localStorage.getItem(PRESET_KEY)
    if (savedPreset && isArchitecturalPreset(savedPreset)) {
      initialPreset = savedPreset
      setArchitecturalPresetState(initialPreset)
    }

    syncBrowserAccentColor(
      getEffectiveBrowserAccentColor({
        accent: initialAccent,
        customColor: initialCustomColor,
        architecturalPreset: initialPreset,
      })
    )

    const savedDensity = localStorage.getItem(DENSITY_KEY)
    if (savedDensity && isDensityPreset(savedDensity)) setDensityState(savedDensity)
  }, [])

  function persist(patch: AppearancePatch) {
    persistAppearanceSettings(patch).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar aparência')
    })
  }

  function setAccent(newAccent: AccentPreset) {
    markLocalPreferenceChange()
    setAccentState(newAccent)
    setCustomColorState(null)
    setArchitecturalPresetState(null)
    document.documentElement.setAttribute('data-accent', newAccent)
    document.documentElement.removeAttribute('data-preset')
    clearCustomAccentProperties()
    localStorage.setItem('archtime-accent', newAccent)
    localStorage.removeItem(CUSTOM_COLOR_KEY)
    localStorage.removeItem(PRESET_KEY)
    syncBrowserAccentColor(
      getEffectiveBrowserAccentColor({ accent: newAccent, customColor: null, architecturalPreset: null })
    )
    persist({ accentPreset: newAccent, architecturalPreset: null })
  }

  // For server-sync paths (hydration, save response) — updates accent state only
  // without touching the architectural preset or custom color.
  function syncAccentFromRemote(newAccent: AccentPreset) {
    setAccentState(newAccent)
    document.documentElement.setAttribute('data-accent', newAccent)
    clearCustomAccentProperties()
    localStorage.setItem('archtime-accent', newAccent)
    localStorage.removeItem(CUSTOM_COLOR_KEY)
  }

  function setCustomColor(hex: string) {
    const normalized = normalizeHexColor(hex)
    if (!normalized) return
    markLocalPreferenceChange()
    setAccentState('custom')
    setCustomColorState(normalized)
    setArchitecturalPresetState(null)
    document.documentElement.setAttribute('data-accent', 'custom')
    document.documentElement.removeAttribute('data-preset')
    applyCustomAccentProperties(normalized)
    localStorage.setItem('archtime-accent', 'custom')
    localStorage.setItem(CUSTOM_COLOR_KEY, normalized)
    localStorage.removeItem(PRESET_KEY)
    syncBrowserAccentColor(
      getEffectiveBrowserAccentColor({ accent: 'custom', customColor: normalized, architecturalPreset: null })
    )
  }

  function setArchitecturalPreset(preset: ArchitecturalPreset | null) {
    markLocalPreferenceChange()
    setArchitecturalPresetState(preset)
    if (preset) {
      document.documentElement.setAttribute('data-preset', preset)
      localStorage.setItem(PRESET_KEY, preset)
      syncBrowserAccentColor(
        getEffectiveBrowserAccentColor({
          accent,
          customColor,
          architecturalPreset: preset,
        })
      )
    } else {
      document.documentElement.removeAttribute('data-preset')
      localStorage.removeItem(PRESET_KEY)
      syncBrowserAccentColor(
        getEffectiveBrowserAccentColor({
          accent,
          customColor,
          architecturalPreset: null,
        })
      )
    }
    persist({ architecturalPreset: preset })
  }

  function setDensity(newDensity: DensityPreset) {
    markLocalPreferenceChange()
    setDensityState(newDensity)
    document.documentElement.setAttribute('data-density', newDensity)
    localStorage.setItem(DENSITY_KEY, newDensity)
    persist({ density: newDensity })
  }

  // Applies server-synced appearance (hydration path) without marking a local change.
  function syncAppearanceFromRemote(patch: { architecturalPreset?: ArchitecturalPreset | null; density?: DensityPreset }) {
    if (patch.architecturalPreset !== undefined) {
      setArchitecturalPresetState(patch.architecturalPreset)
      if (patch.architecturalPreset) {
        document.documentElement.setAttribute('data-preset', patch.architecturalPreset)
        localStorage.setItem(PRESET_KEY, patch.architecturalPreset)
      } else {
        document.documentElement.removeAttribute('data-preset')
        localStorage.removeItem(PRESET_KEY)
      }
      syncBrowserAccentColor(
        getEffectiveBrowserAccentColor({ accent, customColor, architecturalPreset: patch.architecturalPreset })
      )
    }
    if (patch.density) {
      setDensityState(patch.density)
      document.documentElement.setAttribute('data-density', patch.density)
      localStorage.setItem(DENSITY_KEY, patch.density)
    }
  }

  return (
    <AccentColorContext.Provider
      value={{ accent, setAccent, syncAccentFromRemote, customColor, setCustomColor, architecturalPreset, setArchitecturalPreset, density, setDensity, syncAppearanceFromRemote }}
    >
      {children}
    </AccentColorContext.Provider>
  )
}

export function useAccentColor() {
  return useContext(AccentColorContext)
}
