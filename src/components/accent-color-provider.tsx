'use client'

import { createContext, useContext, useState, useEffect } from 'react'

export const ACCENTS = {
  indigo:   '#6366f1',
  violet:   '#a855f7',
  lavender: '#8b5cf6',
  fuchsia:  '#d946ef',
  rose:     '#f43f5e',
  ruby:     '#e11d48',
  coral:    '#f97316',
  amber:    '#f59e0b',
  emerald:  '#10b981',
  teal:     '#14b8a6',
  cyan:     '#06b6d4',
  blue:     '#3b82f6',
} as const

export type AccentKey = keyof typeof ACCENTS

interface AccentColorContextValue {
  accent: AccentKey
  setAccent: (a: AccentKey) => void
}

const AccentColorContext = createContext<AccentColorContextValue>({
  accent: 'indigo',
  setAccent: () => {},
})

export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentKey>('indigo')

  useEffect(() => {
    const saved = localStorage.getItem('archtime-accent') as AccentKey | null
    if (saved && saved in ACCENTS) {
      setAccentState(saved)
    }
  }, [])

  function setAccent(newAccent: AccentKey) {
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
