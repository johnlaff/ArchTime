'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

export function usePerfMonitor() {
  const pathname = usePathname()
  const prevRef = useRef(pathname)
  const startRef = useRef(
    typeof performance !== 'undefined' ? performance.now() : 0
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('archtime-perf') !== '1') return

    if (prevRef.current !== pathname) {
      const elapsed = Math.round(performance.now() - startRef.current)
      console.log(
        `%c[ArchTime Perf]%c ${prevRef.current} → ${pathname}: %c${elapsed}ms`,
        'color:#6366f1;font-weight:bold',
        'color:inherit',
        elapsed < 150 ? 'color:#10b981;font-weight:bold' : elapsed < 300 ? 'color:#f59e0b;font-weight:bold' : 'color:#ef4444;font-weight:bold'
      )
      prevRef.current = pathname
    }
    startRef.current = performance.now()
  }, [pathname])
}
