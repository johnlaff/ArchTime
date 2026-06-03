'use client'

import { cn } from '@/lib/utils'

/**
 * Renders an "HH:MM:SS" elapsed string with a flip animation on each digit that
 * changes. The key is `${index}-${char}`, so a digit only remounts (and replays
 * `.animate-flip-digit`) when its value changes — the seconds digit each tick, the
 * higher digits rarely. Colons are static. Layout is stable via tabular-nums.
 */
export function TimerDisplay({ time, className }: { time: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center tabular-nums', className)} role="timer" aria-label={time}>
      {time.split('').map((char, index) =>
        char === ':' ? (
          <span key={`sep-${index}`} aria-hidden="true" className="px-0.5 text-muted-foreground">
            :
          </span>
        ) : (
          <span
            key={`${index}-${char}`}
            aria-hidden="true"
            className="animate-flip-digit inline-block text-center"
          >
            {char}
          </span>
        )
      )}
    </span>
  )
}
