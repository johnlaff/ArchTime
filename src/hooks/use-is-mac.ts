'use client'

import { useMemo } from 'react'

export function useIsMac(): boolean {
  return useMemo(() => {
    if (typeof navigator === 'undefined') return false
    if ('userAgentData' in navigator) {
      return (
        navigator as Navigator & { userAgentData: { platform: string } }
      ).userAgentData.platform === 'macOS'
    }
    return /Mac|iPhone|iPod|iPad/.test(navigator.platform)
  }, [])
}
