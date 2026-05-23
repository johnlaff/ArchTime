'use client'

import { useCallback } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  getNextThemeMode,
  markLocalPreferenceChange,
  persistAppearanceSettings,
} from '@/lib/appearance'

export function useThemeToggle(): (e?: React.MouseEvent) => void {
  const { resolvedTheme, setTheme } = useTheme()

  return useCallback(
    (e?: React.MouseEvent) => {
      const next = getNextThemeMode(resolvedTheme)
      markLocalPreferenceChange()

      const x = e?.clientX ?? window.innerWidth / 2
      const y = e?.clientY ?? window.innerHeight / 2

      function apply() {
        // Apply class synchronously so startViewTransition captures the correct snapshot
        if (next === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        setTheme(next)
        persistAppearanceSettings({ themeMode: next }).catch((err) => {
          toast.error(err instanceof Error ? err.message : 'Erro ao salvar tema')
        })
      }

      if (typeof document === 'undefined' || !('startViewTransition' in document)) {
        apply()
        return
      }

      const transition = (
        document as Document & {
          startViewTransition: (cb: () => void) => { ready: Promise<void> }
        }
      ).startViewTransition(apply)

      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      )

      transition.ready.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 450,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          }
        )
      })
    },
    [resolvedTheme, setTheme]
  )
}
