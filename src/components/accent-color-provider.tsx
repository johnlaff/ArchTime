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
import { getColorInputValue, normalizeHexColor } from '@/lib/custom-color'

export const ACCENTS = Object.fromEntries(
  Object.entries(ACCENT_PRESETS).map(([key, preset]) => [key, preset.color])
) as Record<AccentPreset, string>

const PRESET_KEY = 'archtime-preset'
const DENSITY_KEY = 'archtime-density'
const CUSTOM_COLOR_KEY = 'archtime-accent-custom'

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

export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentPreset | 'custom'>('indigo')
  const [customColor, setCustomColorState] = useState<string | null>(null)
  const [architecturalPreset, setArchitecturalPresetState] = useState<ArchitecturalPreset | null>(null)
  const [density, setDensityState] = useState<DensityPreset>('cozy')

  useEffect(() => {
    const savedAccent = localStorage.getItem('archtime-accent')
    if (savedAccent === 'custom') {
      setAccentState('custom')
      const savedCustom = getColorInputValue(localStorage.getItem(CUSTOM_COLOR_KEY))
      setCustomColorState(savedCustom)
      document.documentElement.style.setProperty('--custom-accent-hex', savedCustom)
    } else if (savedAccent && Object.hasOwn(ACCENT_PRESETS, savedAccent)) {
      setAccentState(savedAccent as AccentPreset)
    }

    const savedPreset = localStorage.getItem(PRESET_KEY)
    if (savedPreset && isArchitecturalPreset(savedPreset)) {
      setArchitecturalPresetState(savedPreset)
    }

    const savedDensity = localStorage.getItem(DENSITY_KEY)
    if (savedDensity && isDensityPreset(savedDensity)) setDensityState(savedDensity)
  }, [])

  function setAccent(newAccent: AccentPreset) {
    markLocalPreferenceChange()
    setAccentState(newAccent)
    setCustomColorState(null)
    document.documentElement.setAttribute('data-accent', newAccent)
    document.documentElement.style.removeProperty('--custom-accent-hex')
    localStorage.setItem('archtime-accent', newAccent)
    localStorage.removeItem(CUSTOM_COLOR_KEY)
    if (!architecturalPreset) {
      const color = ACCENTS[newAccent]
      document.cookie = `archtime-accent-color=${color};path=/;max-age=31536000;SameSite=Lax`
    }
  }

  function setCustomColor(hex: string) {
    const normalized = normalizeHexColor(hex)
    if (!normalized) return
    markLocalPreferenceChange()
    setAccentState('custom')
    setCustomColorState(normalized)
    document.documentElement.setAttribute('data-accent', 'custom')
    document.documentElement.style.setProperty('--custom-accent-hex', normalized)
    localStorage.setItem('archtime-accent', 'custom')
    localStorage.setItem(CUSTOM_COLOR_KEY, normalized)
    document.cookie = `archtime-accent-color=${normalized};path=/;max-age=31536000;SameSite=Lax`
  }

  function setArchitecturalPreset(preset: ArchitecturalPreset | null) {
    markLocalPreferenceChange()
    setArchitecturalPresetState(preset)
    if (preset) {
      document.documentElement.setAttribute('data-preset', preset)
      localStorage.setItem(PRESET_KEY, preset)
      const color = ARCHITECTURAL_PRESETS[preset].color
      document.cookie = `archtime-accent-color=${color};path=/;max-age=31536000;SameSite=Lax`
    } else {
      document.documentElement.removeAttribute('data-preset')
      localStorage.removeItem(PRESET_KEY)
      const color = accent === 'custom' ? getColorInputValue(customColor) : ACCENTS[accent]
      document.cookie = `archtime-accent-color=${color};path=/;max-age=31536000;SameSite=Lax`
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
