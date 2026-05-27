'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const APP_ROUTES = [
  '/dashboard',
  '/historico',
  '/projetos',
  '/configuracoes',
] as const

const PREFETCH_DELAY_MS = 450
const PREFETCH_STAGGER_MS = 350

type TimerHandle = ReturnType<typeof setTimeout>

function scheduleIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(callback, { timeout: 1_500 })
    return () => window.cancelIdleCallback(idleId)
  }

  const timeoutId = setTimeout(callback, PREFETCH_DELAY_MS)
  return () => clearTimeout(timeoutId)
}

function shouldSkipPrefetch(): boolean {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection

  return connection?.saveData === true || connection?.effectiveType === '2g'
}

export function useRoutePrefetch({ disabled = false }: { disabled?: boolean } = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const prefetchedRoutesRef = useRef(new Set<string>())

  useEffect(() => {
    if (disabled || shouldSkipPrefetch()) return

    let cancelled = false
    const timeoutIds: TimerHandle[] = []

    const cancelIdle = scheduleIdle(() => {
      APP_ROUTES
        .filter((href) => href !== pathname && !prefetchedRoutesRef.current.has(href))
        .forEach((href, index) => {
          const timeoutId = setTimeout(() => {
            if (cancelled) return
            prefetchedRoutesRef.current.add(href)
            router.prefetch(href)
          }, PREFETCH_DELAY_MS + index * PREFETCH_STAGGER_MS)
          timeoutIds.push(timeoutId)
        })
    })

    return () => {
      cancelled = true
      cancelIdle()
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId))
    }
  }, [disabled, pathname, router])
}
