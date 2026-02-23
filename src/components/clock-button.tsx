'use client'

import { LogIn, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ClockButtonProps {
  isClockedIn: boolean
  onClick: () => void
  loading: boolean
}

export function ClockButton({ isClockedIn, onClick, loading }: ClockButtonProps) {
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={loading}
      className={`
        w-full h-20 text-xl font-bold gap-3 transition-all duration-200
        ${isClockedIn
          ? 'bg-rose-500 hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700'
          : 'bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700'
        }
        text-white shadow-lg active:scale-95
      `}
    >
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : isClockedIn ? (
        <>
          <LogOut className="h-6 w-6" /> SAÍDA
        </>
      ) : (
        <>
          <LogIn className="h-6 w-6" /> ENTRADA
        </>
      )}
    </Button>
  )
}
