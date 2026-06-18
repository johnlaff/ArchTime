'use client'

import { useEffect, useState } from 'react'

function formatElapsed(startTime: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
  )
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function useTimer(startTime: string | null): string {
  const [elapsed, setElapsed] = useState('00:00:00')

  useEffect(() => {
    // Sem startTime não há contagem: o valor nulo é derivado direto no return,
    // evitando ajustar state dentro do effect (no-adjust-state-on-prop-change).
    if (!startTime) return

    function tick() {
      setElapsed(formatElapsed(startTime!))
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  // '00:00:00' inicial (determinístico no SSR/hidratação) e quando não há sessão ativa.
  return startTime ? elapsed : '00:00:00'
}
