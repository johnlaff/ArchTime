'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { syncThemeColorMeta } from '@/lib/theme-color'

/**
 * Mantém o <meta name="theme-color"> (status bar do PWA / barra do navegador) alinhado
 * ao fundo do tema resolvido. Observa o documentElement porque o fundo muda por várias
 * vias — classe .dark (tema), data-accent/data-preset (tinge o fundo) e data-bg-tint —
 * e coalesce as mutações num requestAnimationFrame para ler o fundo já recalculado uma
 * vez por frame, em vez de a cada atributo.
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme()

  // resolvedTheme muda ⇒ o tema já está aplicado no DOM (inclusive quando o SO alterna
  // e o modo é "system"); sincroniza a status bar com o novo fundo.
  useEffect(() => {
    syncThemeColorMeta()
  }, [resolvedTheme])

  useEffect(() => {
    const root = document.documentElement
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        syncThemeColorMeta()
      })
    }

    const observer = new MutationObserver(schedule)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-accent', 'data-preset', 'data-bg-tint', 'data-blueprint'],
    })

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
