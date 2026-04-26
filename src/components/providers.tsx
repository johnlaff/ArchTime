'use client'

import { useEffect } from 'react'
import { ThemeProvider, useTheme } from 'next-themes'
import { SyncProvider } from './sync-provider'
import { Toaster } from '@/components/ui/sonner'
import { useAccentColor } from '@/components/accent-color-provider'

function PreferencesHydrator() {
  const { setTheme } = useTheme()
  const { setAccent } = useAccentColor()

  useEffect(() => {
    let cancelled = false
    fetch('/api/settings')
      .then((res) => res.ok ? res.json() : null)
      .then((body) => {
        if (cancelled || !body?.settings) return
        setAccent(body.settings.accentPreset)
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
