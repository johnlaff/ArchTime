'use client'

import { BookOpen, Box, HardHat, MapPin, Receipt, Ruler, Users, type LucideIcon } from 'lucide-react'
import { ACTIVITY_TYPE_KEYS, ACTIVITY_TYPES, isActivityType, type ActivityType } from '@/lib/activity-types'

const ACTIVITY_ICONS: Record<ActivityType, LucideIcon> = {
  'visita-cliente': MapPin,
  modelagem: Box,
  prancha: Ruler,
  reuniao: Users,
  obra: HardHat,
  admin: Receipt,
  estudo: BookOpen,
}

interface ActivitySelectorProps {
  value: ActivityType | null
  onChange: (value: ActivityType | null) => void
  disabled?: boolean
  /** Restrict to a subset (e.g. inside a compact dialog). Defaults to all 7. */
  keys?: readonly ActivityType[]
}

/**
 * Exclusive chip group: clicking the active chip clears it (activity is optional).
 * Used both before clock-in (dashboard) and in the session edit dialog.
 */
export function ActivitySelector({ value, onChange, disabled, keys = ACTIVITY_TYPE_KEYS }: ActivitySelectorProps) {
  return (
    // react-doctor-disable-next-line react-doctor/prefer-tag-over-role -- não há tag HTML semântica para um grupo de botões toggle; role="group" + aria-label é o padrão ARIA correto
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de atividade">
      {keys.map((key) => {
        const Icon = ACTIVITY_ICONS[key]
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(active ? null : key)}
            className={[
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'border-primary bg-accent text-accent-foreground font-medium'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
            ].join(' ')}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            {ACTIVITY_TYPES[key].label}
          </button>
        )
      })}
    </div>
  )
}

/** Read-only pill shown next to a session's project name in lists. */
export function ActivityTag({ activityType, className }: { activityType: string | null | undefined; className?: string }) {
  if (!isActivityType(activityType)) return null
  const Icon = ACTIVITY_ICONS[activityType]
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border border-primary/30 bg-accent px-1.5 py-0.5 text-[10px] font-medium leading-none text-accent-foreground',
        className ?? '',
      ].join(' ')}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      {ACTIVITY_TYPES[activityType].label}
    </span>
  )
}
