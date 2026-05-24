'use client'

import { useCallback, useEffect } from 'react'
import { ThemeProvider, useTheme } from 'next-themes'
import { SyncProvider } from './sync-provider'
import { Toaster } from '@/components/ui/sonner'
import { useAccentColor } from '@/components/accent-color-provider'
import { usePerfMonitor } from '@/hooks/use-perf-monitor'
import { useThemeToggle } from '@/hooks/use-theme-toggle'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import {
  getLastLocalPreferenceChange,
  hasLocalCustomAccentPreference,
  shouldApplyRemotePreferences,
} from '@/lib/appearance'

function PreferencesHydrator() {
  const { setTheme } = useTheme()
  const { setAccent } = useAccentColor()
  usePerfMonitor()

  const toggleTheme = useThemeToggle()
  const handleThemeToggle = useCallback(() => toggleTheme(), [toggleTheme])
  useKeyboardShortcuts({ onThemeToggle: handleThemeToggle })

  useEffect(() => {
    let cancelled = false
    const startedAt = Date.now()
    fetch('/api/settings')
      .then((res) => res.ok ? res.json() : null)
      .then((body) => {
        if (cancelled || !body?.settings) return
        if (!shouldApplyRemotePreferences(startedAt, getLastLocalPreferenceChange())) return
        if (!hasLocalCustomAccentPreference()) setAccent(body.settings.accentPreset)
        setTheme(body.settings.themeMode)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [setAccent, setTheme])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SyncProvider>
        <PreferencesHydrator />
        {children}
        <Toaster richColors position="bottom-center" closeButton />
      </SyncProvider>
    </ThemeProvider>
  )
}
