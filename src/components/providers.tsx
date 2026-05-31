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
import {
  getLastLocalPreferenceChange,
  hasLocalCustomAccentPreference,
  shouldApplyRemotePreferences,
} from '@/lib/appearance'

function PreferencesHydrator() {
  const pathname = usePathname()
  const { setTheme } = useTheme()
  const { syncAppearanceFromRemote } = useAccentColor()
  usePerfMonitor()

  const toggleTheme = useThemeToggle()
  const handleThemeToggle = useCallback(() => toggleTheme(), [toggleTheme])
  const isAuthRoute = pathname === '/login' || pathname.startsWith('/auth/')
  useKeyboardShortcuts({ onThemeToggle: handleThemeToggle, disabled: isAuthRoute })

  useEffect(() => {
    if (isAuthRoute) return

    let cancelled = false
    const startedAt = Date.now()
    fetch('/api/settings')
      .then((res) => res.ok ? res.json() : null)
      .then((body) => {
        if (cancelled || !body?.settings) return
        if (!shouldApplyRemotePreferences(startedAt, getLastLocalPreferenceChange())) return
        // Skip overwriting a local custom accent only when the server is a plain
        // preset — but when both sides are 'custom', the server hex is newer (the
        // user updated it on another device) so we DO sync it.
        if (!hasLocalCustomAccentPreference() || body.settings.accentPreset === 'custom') {
          syncAppearanceFromRemote({
            accentPreset: body.settings.accentPreset,
            customAccentColor: body.settings.customAccentColor,
            architecturalPreset: body.settings.architecturalPreset ?? null,
            density: body.settings.density,
          })
        } else {
          syncAppearanceFromRemote({
            architecturalPreset: body.settings.architecturalPreset ?? null,
            density: body.settings.density,
          })
        }
        setTheme(body.settings.themeMode)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [syncAppearanceFromRemote, setTheme, isAuthRoute])

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
