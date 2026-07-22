'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { readResolvedBackgroundColor, THEME_COLOR_DARK, writeThemeColorMeta } from '@/lib/theme-color'

/**
 * O fundo do tema é uma fonte mutável FORA do React: muda por várias vias — classe
 * .dark (next-themes), data-accent/data-preset (tinge o fundo) e data-bg-tint — e
 * alguns desses atributos são escritos por um script anti-flash pré-hidratação e por
 * estado de página não compartilhado. useSyncExternalStore é o hook idiomático para
 * ler uma fonte externa dessas (tearing-safe sob concurrent rendering), com o
 * MutationObserver como `subscribe`. O snapshot é cacheado porque ler o fundo
 * (getComputedStyle + canvas) não deve rodar a cada render — só quando o observer
 * dispara, coalescido num requestAnimationFrame para ler o fundo já recalculado.
 */

const OBSERVED_ATTRIBUTES = ['class', 'data-accent', 'data-preset', 'data-bg-tint', 'data-blueprint']

let cachedColor: string | null = null

function subscribe(onStoreChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {}

  const root = document.documentElement
  let frame = 0
  const recompute = () => {
    frame = 0
    const next = readResolvedBackgroundColor()
    if (next !== cachedColor) {
      cachedColor = next
      onStoreChange()
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(recompute)
  }

  cachedColor = readResolvedBackgroundColor()
  const observer = new MutationObserver(schedule)
  observer.observe(root, { attributes: true, attributeFilter: OBSERVED_ATTRIBUTES })

  return () => {
    observer.disconnect()
    if (frame) cancelAnimationFrame(frame)
  }
}

function getSnapshot(): string {
  return cachedColor ?? readResolvedBackgroundColor()
}

function getServerSnapshot(): string {
  return THEME_COLOR_DARK
}

export function ThemeColorSync() {
  const color = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    writeThemeColorMeta(color)
  }, [color])

  return null
}
