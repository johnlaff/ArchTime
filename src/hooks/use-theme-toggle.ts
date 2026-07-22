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
        // O reveal é uma animação CSS (@keyframes theme-reveal no snapshot do novo
        // tema), não um WAAPI agendado em transition.ready: começa no mesmo frame em
        // que o pseudo-elemento nasce. O WAAPI agendado abria um gap de 1-2 frames no
        // mobile (o ready resolve mais devagar) em que o novo tema aparecia sem o
        // clip-path — um flash de tela cheia. A view transition só resolve `finished`
        // quando a animação CSS termina.
        transition.finished.catch(() => {}).finally(() => {
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
