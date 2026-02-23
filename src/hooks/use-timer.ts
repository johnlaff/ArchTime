'use client'

import { useEffect, useState } from 'react'

export function useTimer(startTime: string | null): string {
  const [elapsed, setElapsed] = useState('00:00:00')

  useEffect(() => {
    if (!startTime) {
      setElapsed('00:00:00')
      return
    }

    function tick() {
      const seconds = Math.floor((Date.now() - new Date(startTime!).getTime()) / 1000)
      const h = Math.floor(seconds / 3600)
      const m = Math.floor((seconds % 3600) / 60)
      const s = seconds % 60
      setElapsed(
        `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      )
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  return elapsed
}
