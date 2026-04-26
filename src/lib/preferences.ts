export const WEEKDAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'] as const
export type WeekdayKey = typeof WEEKDAY_KEYS[number]
export type WorkMinutesByWeekday = Record<WeekdayKey, number>

export const WORK_SCHEDULE_TEMPLATES = {
  standard_40h: {
    label: 'Padrão atual 40h',
    minutes: { '0': 0, '1': 480, '2': 480, '3': 480, '4': 480, '5': 480, '6': 0 },
  },
  pj_30h: {
    label: 'PJ flex 30h',
    minutes: { '0': 0, '1': 360, '2': 360, '3': 360, '4': 360, '5': 360, '6': 0 },
  },
  part_time_20h: {
    label: 'Meio período 20h',
    minutes: { '0': 0, '1': 240, '2': 240, '3': 240, '4': 240, '5': 240, '6': 0 },
  },
  no_expected: {
    label: 'Sem previsão',
    minutes: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 },
  },
  custom: {
    label: 'Personalizado',
    minutes: { '0': 0, '1': 480, '2': 480, '3': 480, '4': 480, '5': 480, '6': 0 },
  },
} satisfies Record<string, { label: string; minutes: WorkMinutesByWeekday }>

export type WorkScheduleTemplate = keyof typeof WORK_SCHEDULE_TEMPLATES

export const CUMULATIVE_BALANCE_SCOPES = {
  since_start: 'Desde o início configurado',
  year_to_date: 'Ano atual',
  rolling_3_months: 'Últimos 3 meses',
  rolling_6_months: 'Últimos 6 meses',
  rolling_12_months: 'Últimos 12 meses',
} as const

export type CumulativeBalanceScope = keyof typeof CUMULATIVE_BALANCE_SCOPES

export const THEME_MODES = ['system', 'light', 'dark'] as const
export type ThemeMode = typeof THEME_MODES[number]

export const ACCENT_PRESETS = {
  indigo: {
    label: 'Índigo',
    color: '#6366f1',
    css: {
      primary: 'oklch(0.55 0.22 277)',
      primaryDark: 'oklch(0.68 0.20 277)',
      accent: 'oklch(0.95 0.035 277)',
      accentDark: 'oklch(0.26 0.055 277)',
      muted: 'oklch(0.97 0.012 277)',
      mutedDark: 'oklch(0.23 0.025 277)',
    },
  },
  rose: {
    label: 'Rosa',
    color: '#f43f5e',
    css: {
      primary: 'oklch(0.58 0.22 350)',
      primaryDark: 'oklch(0.72 0.19 350)',
      accent: 'oklch(0.96 0.045 350)',
      accentDark: 'oklch(0.27 0.06 350)',
      muted: 'oklch(0.98 0.018 350)',
      mutedDark: 'oklch(0.23 0.03 350)',
    },
  },
  amber: {
    label: 'Âmbar',
    color: '#f59e0b',
    css: {
      primary: 'oklch(0.68 0.18 70)',
      primaryDark: 'oklch(0.78 0.16 70)',
      accent: 'oklch(0.96 0.05 70)',
      accentDark: 'oklch(0.28 0.055 70)',
      muted: 'oklch(0.98 0.02 70)',
      mutedDark: 'oklch(0.24 0.03 70)',
    },
  },
  emerald: {
    label: 'Esmeralda',
    color: '#10b981',
    css: {
      primary: 'oklch(0.60 0.18 155)',
      primaryDark: 'oklch(0.72 0.16 155)',
      accent: 'oklch(0.95 0.045 155)',
      accentDark: 'oklch(0.25 0.05 155)',
      muted: 'oklch(0.97 0.018 155)',
      mutedDark: 'oklch(0.23 0.03 155)',
    },
  },
  blue: {
    label: 'Azul',
    color: '#3b82f6',
    css: {
      primary: 'oklch(0.55 0.20 255)',
      primaryDark: 'oklch(0.68 0.18 255)',
      accent: 'oklch(0.95 0.04 255)',
      accentDark: 'oklch(0.25 0.055 255)',
      muted: 'oklch(0.97 0.015 255)',
      mutedDark: 'oklch(0.23 0.03 255)',
    },
  },
  slate: {
    label: 'Grafite',
    color: '#64748b',
    css: {
      primary: 'oklch(0.45 0.045 255)',
      primaryDark: 'oklch(0.78 0.04 255)',
      accent: 'oklch(0.94 0.012 255)',
      accentDark: 'oklch(0.25 0.018 255)',
      muted: 'oklch(0.97 0.006 255)',
      mutedDark: 'oklch(0.22 0.012 255)',
    },
  },
} as const

export type AccentPreset = keyof typeof ACCENT_PRESETS

export const DEFAULT_WORK_MINUTES_BY_WEEKDAY: WorkMinutesByWeekday =
  WORK_SCHEDULE_TEMPLATES.standard_40h.minutes

export function isWorkScheduleTemplate(value: unknown): value is WorkScheduleTemplate {
  return typeof value === 'string' && value in WORK_SCHEDULE_TEMPLATES
}

export function isCumulativeBalanceScope(value: unknown): value is CumulativeBalanceScope {
  return typeof value === 'string' && value in CUMULATIVE_BALANCE_SCOPES
}

export function isAccentPreset(value: unknown): value is AccentPreset {
  return typeof value === 'string' && value in ACCENT_PRESETS
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value)
}

export function normalizeWorkMinutesByWeekday(value: unknown): WorkMinutesByWeekday | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const normalized = {} as WorkMinutesByWeekday

  for (const key of WEEKDAY_KEYS) {
    const raw = source[key]
    const minutes = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) return null
    normalized[key] = minutes
  }

  return normalized
}

export function detectWorkScheduleTemplate(
  minutes: WorkMinutesByWeekday
): WorkScheduleTemplate {
  for (const key of Object.keys(WORK_SCHEDULE_TEMPLATES) as WorkScheduleTemplate[]) {
    if (key === 'custom') continue
    const template = WORK_SCHEDULE_TEMPLATES[key].minutes
    if (WEEKDAY_KEYS.every((day) => template[day] === minutes[day])) return key
  }
  return 'custom'
}
