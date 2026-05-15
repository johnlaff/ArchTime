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

export const ACCENTS = Object.fromEntries(
  Object.entries(ACCENT_PRESETS).map(([key, preset]) => [key, preset.color])
) as Record<AccentPreset, string>

const PRESET_KEY = 'archtime-preset'
const DENSITY_KEY = 'archtime-density'

interface AccentColorContextValue {
  accent: AccentPreset
  setAccent: (a: AccentPreset) => void
  architecturalPreset: ArchitecturalPreset | null
  setArchitecturalPreset: (p: ArchitecturalPreset | null) => void
  density: DensityPreset
  setDensity: (d: DensityPreset) => void
}

const AccentColorContext = createContext<AccentColorContextValue>({
  accent: 'indigo',
  setAccent: () => {},
  architecturalPreset: null,
  setArchitecturalPreset: () => {},
  density: 'cozy',
  setDensity: () => {},
})

export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentPreset>('indigo')
  const [architecturalPreset, setArchitecturalPresetState] = useState<ArchitecturalPreset | null>(null)
  const [density, setDensityState] = useState<DensityPreset>('cozy')

  useEffect(() => {
    const savedAccent = localStorage.getItem('archtime-accent') as AccentPreset | null
    if (savedAccent && Object.hasOwn(ACCENT_PRESETS, savedAccent)) setAccentState(savedAccent)

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
    document.documentElement.setAttribute('data-accent', newAccent)
    localStorage.setItem('archtime-accent', newAccent)
    // Only update PWA icon cookie when no architectural preset is overriding
    if (!architecturalPreset) {
      const color = ACCENTS[newAccent]
      document.cookie = `archtime-accent-color=${color};path=/;max-age=31536000;SameSite=Lax`
    }
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
      const color = ACCENTS[accent]
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
      value={{ accent, setAccent, architecturalPreset, setArchitecturalPreset, density, setDensity }}
    >
      {children}
    </AccentColorContext.Provider>
  )
}

export function useAccentColor() {
  return useContext(AccentColorContext)
}
