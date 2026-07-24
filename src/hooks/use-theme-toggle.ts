'use client'

import { useCallback, useRef } from 'react'
import type { MouseEvent } from 'react'
import { useTheme } from 'next-themes'
import {
  getNextThemeMode,
  markLocalPreferenceChange,
} from '@/lib/appearance'
import { enqueueAppearancePatch } from '@/lib/settings-sync'
import {
  animateThemeReveal,
  beginThemeSwitch,
  clearThemeRevealGeometry,
  endThemeSwitch,
  getThemeRevealOrigin,
  getThemeRevealRadius,
  setResolvedThemeClass,
  setThemeRevealGeometry,
  startThemeViewTransition,
  THEME_SWITCH_SUPPRESSION_MS,
} from '@/lib/theme-transition'

export function useThemeToggle(): (e?: MouseEvent) => void {
  const { resolvedTheme, setTheme } = useTheme()
  const timerRef = useRef<number | null>(null)
  const toggleIdRef = useRef(0)

  return useCallback(
    (e?: MouseEvent) => {
      if (!resolvedTheme) return

      const toggleId = ++toggleIdRef.current
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
        // Reveal híbrido: o snapshot do novo tema nasce recortado em raio 0 pelo
        // clip-path estático de globals.css (sem flash de tela cheia no gap até o
        // ready, que no Chrome mobile leva 1-2 frames), e o círculo cresce via WAAPI
        // criado aqui, em transition.ready — com os snapshots prontos, sem jank de
        // captura. `finished` só resolve quando a animação termina.
        transition.ready.then(
          () => {
            if (toggleId !== toggleIdRef.current) return
            animateThemeReveal(root, origin, radius)
          },
          () => {}
        )
        transition.finished.catch(() => {}).finally(() => {
          timerRef.current = window.setTimeout(clearSuppression, THEME_SWITCH_SUPPRESSION_MS)
        })
      }

      enqueueAppearancePatch({ themeMode: next })
    },
    [resolvedTheme, setTheme]
  )
}
