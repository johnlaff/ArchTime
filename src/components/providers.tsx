'use client'

import { useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { MotionConfig } from 'motion/react'
import { ThemeProvider, useTheme } from 'next-themes'
import { SyncProvider } from './sync-provider'
import { Toaster } from '@/components/ui/sonner'
import { useAccentColor } from '@/components/accent-color-provider'
import { usePerfMonitor } from '@/hooks/use-perf-monitor'
import { useThemeToggle } from '@/hooks/use-theme-toggle'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useRoutePrefetch } from '@/hooks/use-route-prefetch'
import {
  getLastLocalPreferenceChange,
  hasLocalCustomAccentPreference,
  shouldApplyRemotePreferences,
} from '@/lib/appearance'

function PreferencesHydrator() {
  const pathname = usePathname()
  const { setTheme } = useTheme()
  const { syncAccentFromRemote } = useAccentColor()
  usePerfMonitor()

  const toggleTheme = useThemeToggle()
  const handleThemeToggle = useCallback(() => toggleTheme(), [toggleTheme])
  const isAuthRoute = pathname === '/login' || pathname.startsWith('/auth/')
  useKeyboardShortcuts({ onThemeToggle: handleThemeToggle, disabled: isAuthRoute })
  useRoutePrefetch({ disabled: isAuthRoute })

  useEffect(() => {
    if (isAuthRoute) return

    let cancelled = false
    const startedAt = Date.now()
    fetch('/api/settings')
      .then((res) => res.ok ? res.json() : null)
      .then((body) => {
        if (cancelled || !body?.settings) return
        if (!shouldApplyRemotePreferences(startedAt, getLastLocalPreferenceChange())) return
        if (!hasLocalCustomAccentPreference()) syncAccentFromRemote(body.settings.accentPreset)
        setTheme(body.settings.themeMode)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [syncAccentFromRemote, setTheme, isAuthRoute])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {/* reducedMotion="never": animations are part of the product experience and
          play regardless of the OS prefers-reduced-motion setting (deliberate choice). */}
      <MotionConfig reducedMotion="never">
        <SyncProvider>
          <PreferencesHydrator />
          {children}
          <Toaster richColors position="bottom-center" closeButton />
        </SyncProvider>
      </MotionConfig>
    </ThemeProvider>
  )
}
