'use client'

import { useEffect, useState } from 'react'

export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    if ('userAgentData' in navigator) {
      setIsMac(
        (navigator as Navigator & { userAgentData: { platform: string } })
          .userAgentData.platform === 'macOS'
      )
    } else {
      setIsMac(/Mac|iPhone|iPod|iPad/.test(navigator.platform))
    }
  }, [])

  return isMac
}
