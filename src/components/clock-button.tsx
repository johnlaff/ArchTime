'use client'

import { motion, AnimatePresence } from 'motion/react'
import { LogIn, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ClockButtonProps {
  isClockedIn: boolean
  onClick: () => void
  loading: boolean
}

const MotionButton = motion.create(Button)

export function ClockButton({ isClockedIn, onClick, loading }: ClockButtonProps) {
  return (
    <MotionButton
      size="lg"
      onClick={onClick}
      disabled={loading}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={[
        'w-full h-20 text-xl font-bold gap-3',
        'will-change-transform rounded-2xl overflow-hidden',
        isClockedIn
          ? 'bg-rose-500 hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700 animate-glow-red'
          : 'bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 animate-glow-green',
        'text-white',
      ].join(' ')}
    >
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Loader2 className="h-6 w-6 animate-spin" />
          </motion.span>
        ) : isClockedIn ? (
          <motion.span
            key="out"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3"
          >
            <LogOut className="h-6 w-6" /> SAÍDA
          </motion.span>
        ) : (
          <motion.span
            key="in"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3"
          >
            <LogIn className="h-6 w-6" /> ENTRADA
          </motion.span>
        )}
      </AnimatePresence>
    </MotionButton>
  )
}
