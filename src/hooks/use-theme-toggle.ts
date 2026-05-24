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
  getThemeRevealOrigin,
  getThemeRevealRadius,
  setResolvedThemeClass,
  THEME_REVEAL_DURATION_MS,
  THEME_SWITCH_SUPPRESSION_MS,
} from '@/lib/theme-transition'

let themeSwitchTimer: number | null = null

export function useThemeToggle(): (e?: React.MouseEvent) => void {
  const { resolvedTheme, setTheme } = useTheme()

  return useCallback(
    (e?: React.MouseEvent) => {
      const next = getNextThemeMode(resolvedTheme)
      markLocalPreferenceChange()

      if (typeof document === 'undefined') {
        return
      }

      const root = document.documentElement
      beginThemeSwitch(root)

      if (themeSwitchTimer) window.clearTimeout(themeSwitchTimer)
      const clearSuppression = () => {
        endThemeSwitch(root)
        themeSwitchTimer = null
      }

      const apply = () => {
        setResolvedThemeClass(root, next)
        setTheme(next)
      }

      if (!('startViewTransition' in document)) {
        apply()
        themeSwitchTimer = window.setTimeout(clearSuppression, THEME_SWITCH_SUPPRESSION_MS)
      } else {
        const viewport = { width: window.innerWidth, height: window.innerHeight }
        const origin = getThemeRevealOrigin(e, viewport)
        const radius = getThemeRevealRadius(origin, viewport)
        const transition = (
          document as Document & {
            startViewTransition: (callback: () => void) => {
              ready: Promise<void>
              finished: Promise<void>
            }
          }
        ).startViewTransition(apply)

        transition.ready
          .then(() => {
            root.animate(
              {
                clipPath: [
                  `circle(0px at ${origin.x}px ${origin.y}px)`,
                  `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
                ],
              },
              {
                duration: THEME_REVEAL_DURATION_MS,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                pseudoElement: '::view-transition-new(root)',
              }
            )
          })
          .catch(() => {})

        transition.finished
          .catch(() => {})
          .finally(() => {
            themeSwitchTimer = window.setTimeout(clearSuppression, THEME_SWITCH_SUPPRESSION_MS)
          })
      }

      persistAppearanceSettings({ themeMode: next }).catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar tema')
      })
    },
    [resolvedTheme, setTheme]
  )
}
