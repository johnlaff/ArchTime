'use client'

import { useCallback, useRef } from 'react'
import type { MouseEvent } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  getNextThemeMode,
  markLocalPreferenceChange,
  persistAppearanceSettings,
} from '@/lib/appearance'
import {
  beginThemeSwitch,
  clearThemeRevealGeometry,
  endThemeSwitch,
  getThemeRevealOrigin,
  getThemeRevealRadius,
  setResolvedThemeClass,
  setThemeRevealGeometry,
  startThemeViewTransition,
  THEME_REVEAL_DURATION_MS,
  THEME_REVEAL_EASING,
  THEME_SWITCH_SUPPRESSION_MS,
} from '@/lib/theme-transition'

export function useThemeToggle(): (e?: MouseEvent) => void {
  const { resolvedTheme, setTheme } = useTheme()
  const timerRef = useRef<number | null>(null)
  const toggleIdRef = useRef(0)
  const revealAnimationRef = useRef<Animation | null>(null)

  return useCallback(
    (e?: MouseEvent) => {
      if (!resolvedTheme) return

      const toggleId = ++toggleIdRef.current
      revealAnimationRef.current?.cancel()
      revealAnimationRef.current = null

      const next = getNextThemeMode(resolvedTheme)
      markLocalPreferenceChange()

      if (typeof document === 'undefined') {
        return
      }

      const root = document.documentElement
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const origin = getThemeRevealOrigin(e, viewport)
      const radius = getThemeRevealRadius(origin, viewport)
      setThemeRevealGeometry(root, origin, radius)
      beginThemeSwitch(root)

      if (timerRef.current) window.clearTimeout(timerRef.current)
      const clearSuppression = () => {
        if (toggleId !== toggleIdRef.current) return
        endThemeSwitch(root)
        clearThemeRevealGeometry(root)
        timerRef.current = null
      }

      const apply = () => {
        setResolvedThemeClass(root, next)
        setTheme(next)
      }

      const transition = startThemeViewTransition(document, apply)
      if (!transition) {
        timerRef.current = window.setTimeout(clearSuppression, THEME_SWITCH_SUPPRESSION_MS)
      } else {
        transition.ready
          .then(() => {
            const anim = root.animate(
              {
                clipPath: [
                  `circle(0px at ${origin.x}px ${origin.y}px)`,
                  `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
                ],
              },
              {
                duration: THEME_REVEAL_DURATION_MS,
                easing: THEME_REVEAL_EASING,
                fill: 'both',
                pseudoElement: '::view-transition-new(root)',
              }
            )
            revealAnimationRef.current = anim
          })
          .catch(() => {})

        transition.finished
          .catch(() => {})
          .finally(async () => {
            const anim = revealAnimationRef.current
            if (anim) await anim.finished.catch(() => {})
            timerRef.current = window.setTimeout(clearSuppression, THEME_SWITCH_SUPPRESSION_MS)
          })
      }

      persistAppearanceSettings({ themeMode: next }).catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar tema')
      })
    },
    [resolvedTheme, setTheme]
  )
}
