'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { ACCENT_PRESETS, type AccentPreset } from '@/lib/preferences'

export const ACCENTS = Object.fromEntries(
  Object.entries(ACCENT_PRESETS).map(([key, preset]) => [key, preset.color])
) as Record<AccentPreset, string>

interface AccentColorContextValue {
  accent: AccentPreset
  setAccent: (a: AccentPreset) => void
}

const AccentColorContext = createContext<AccentColorContextValue>({
  accent: 'indigo',
  setAccent: () => {},
})

export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentPreset>('indigo')

  useEffect(() => {
    const saved = localStorage.getItem('archtime-accent') as AccentPreset | null
    if (saved && saved in ACCENTS) {
      setAccentState(saved)
    }
  }, [])

  function setAccent(newAccent: AccentPreset) {
    setAccentState(newAccent)
    document.documentElement.setAttribute('data-accent', newAccent)
    localStorage.setItem('archtime-accent', newAccent)
    document.cookie = `archtime-accent-color=${ACCENTS[newAccent]};path=/;max-age=31536000;SameSite=Lax`
  }

  return (
    <AccentColorContext.Provider value={{ accent, setAccent }}>
      {children}
    </AccentColorContext.Provider>
  )
}

export function useAccentColor() {
  return useContext(AccentColorContext)
}
