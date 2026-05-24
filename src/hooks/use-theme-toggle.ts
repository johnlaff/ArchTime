'use client'

import { useCallback } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  getNextThemeMode,
  markLocalPreferenceChange,
  persistAppearanceSettings,
} from '@/lib/appearance'
import {
  beginThemeSwitch,
  endThemeSwitch,
  setResolvedThemeClass,
  THEME_SWITCH_SUPPRESSION_MS,
} from '@/lib/theme-transition'

let themeSwitchTimer: number | null = null

export function useThemeToggle(): (e?: React.MouseEvent) => void {
  const { resolvedTheme, setTheme } = useTheme()

  return useCallback(
    () => {
      const next = getNextThemeMode(resolvedTheme)
      markLocalPreferenceChange()

      if (typeof document === 'undefined') {
        return
      }

      const root = document.documentElement
      beginThemeSwitch(root)
      setResolvedThemeClass(root, next)
      setTheme(next)

      if (themeSwitchTimer) window.clearTimeout(themeSwitchTimer)
      themeSwitchTimer = window.setTimeout(() => {
        endThemeSwitch(root)
        themeSwitchTimer = null
      }, THEME_SWITCH_SUPPRESSION_MS)

      persistAppearanceSettings({ themeMode: next }).catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar tema')
      })
    },
    [resolvedTheme, setTheme]
  )
}
