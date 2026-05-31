import { Prisma, type UserSettings } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getLocalDateBRT, toDateOnlyUTC } from '@/lib/dates'
import {
  ACCENT_PRESETS,
  CUMULATIVE_BALANCE_SCOPES,
  DEFAULT_WORK_MINUTES_BY_WEEKDAY,
  THEME_MODES,
  WORK_SCHEDULE_TEMPLATES,
  detectWorkScheduleTemplate,
  isAccentPreset,
  isArchitecturalPreset,
  isCumulativeBalanceScope,
  isDensityPreset,
  isThemeMode,
  isWeekStartDay,
  isWorkScheduleTemplate,
  normalizeWorkMinutesByWeekday,
  type AccentPreset,
  type ArchitecturalPreset,
  type CumulativeBalanceScope,
  type DensityPreset,
  type ThemeMode,
  type WeekStartDay,
  type WorkMinutesByWeekday,
  type WorkScheduleTemplate,
} from '@/lib/preferences'

export interface SerializedUserSettings {
  workMinutesByWeekday: WorkMinutesByWeekday
  workScheduleTemplate: WorkScheduleTemplate
  showCumulativeBalance: boolean
  cumulativeBalanceScope: CumulativeBalanceScope
  cumulativeStartDate: string
  accentPreset: AccentPreset
  themeMode: ThemeMode
  weekStartDay: WeekStartDay
  architecturalPreset: ArchitecturalPreset | null
  density: DensityPreset
}

export interface SettingsPatch {
  workMinutesByWeekday?: WorkMinutesByWeekday
  workScheduleTemplate?: WorkScheduleTemplate
  showCumulativeBalance?: boolean
  cumulativeBalanceScope?: CumulativeBalanceScope
  cumulativeStartDate?: string
  accentPreset?: AccentPreset
  themeMode?: ThemeMode
  weekStartDay?: WeekStartDay
  architecturalPreset?: ArchitecturalPreset | null
  density?: DensityPreset
}

function firstDayOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}

function serialize(settings: UserSettings): SerializedUserSettings {
  const minutes = normalizeWorkMinutesByWeekday(settings.workMinutesByWeekday) ??
    DEFAULT_WORK_MINUTES_BY_WEEKDAY
  const template = isWorkScheduleTemplate(settings.workScheduleTemplate)
    ? settings.workScheduleTemplate
    : detectWorkScheduleTemplate(minutes)
  const scope = isCumulativeBalanceScope(settings.cumulativeBalanceScope)
    ? settings.cumulativeBalanceScope
    : 'since_start'
  const accentPreset = isAccentPreset(settings.accentPreset) ? settings.accentPreset : 'indigo'
  const themeMode = isThemeMode(settings.themeMode) ? settings.themeMode : 'system'
  const weekStartDay = isWeekStartDay(settings.weekStartDay) ? settings.weekStartDay : 'monday'
  const architecturalPreset = isArchitecturalPreset(settings.architecturalPreset)
    ? settings.architecturalPreset
    : null
  const density = isDensityPreset(settings.density) ? settings.density : 'cozy'

  return {
    workMinutesByWeekday: minutes,
    workScheduleTemplate: template,
    showCumulativeBalance: settings.showCumulativeBalance,
    cumulativeBalanceScope: scope,
    cumulativeStartDate: settings.cumulativeStartDate.toISOString().slice(0, 10),
    accentPreset,
    themeMode,
    weekStartDay,
    architecturalPreset,
    density,
  }
}

async function getDefaultCumulativeStartDate(userId: string): Promise<Date> {
  const firstEntry = await prisma.clockEntry.findFirst({
    where: {
      userId,
      deletedAt: null,
      clockOut: { not: null },
    },
    orderBy: { clockIn: 'asc' },
    select: { clockIn: true },
  })
  const date = firstEntry
    ? firstDayOfMonth(getLocalDateBRT(firstEntry.clockIn))
    : firstDayOfMonth(getLocalDateBRT())
  return toDateOnlyUTC(date)
}

export async function getOrCreateUserSettings(userId: string): Promise<SerializedUserSettings> {
  const existing = await prisma.userSettings.findUnique({ where: { userId } })
  if (existing) return serialize(existing)

  try {
    const created = await prisma.userSettings.create({
      data: {
        userId,
        workMinutesByWeekday: DEFAULT_WORK_MINUTES_BY_WEEKDAY,
        workScheduleTemplate: 'standard_40h',
        showCumulativeBalance: false,
        cumulativeBalanceScope: 'since_start',
        cumulativeStartDate: await getDefaultCumulativeStartDate(userId),
        accentPreset: 'indigo',
        themeMode: 'system',
      },
    })

    return serialize(created)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const racedSettings = await prisma.userSettings.findUnique({ where: { userId } })
      if (racedSettings) return serialize(racedSettings)
    }
    throw error
  }
}

function parseDateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10) === value ? value : null
}

export function parseSettingsPatch(value: Record<string, unknown>): SettingsPatch | string {
  const patch: SettingsPatch = {}

  if ('workScheduleTemplate' in value) {
    if (!isWorkScheduleTemplate(value.workScheduleTemplate)) return 'Template de jornada inválido'
    patch.workScheduleTemplate = value.workScheduleTemplate
    if (value.workScheduleTemplate !== 'custom' && !('workMinutesByWeekday' in value)) {
      patch.workMinutesByWeekday = WORK_SCHEDULE_TEMPLATES[value.workScheduleTemplate].minutes
    }
  }

  if ('workMinutesByWeekday' in value) {
    const minutes = normalizeWorkMinutesByWeekday(value.workMinutesByWeekday)
    if (!minutes) return 'Jornada semanal inválida'
    patch.workMinutesByWeekday = minutes
    patch.workScheduleTemplate = detectWorkScheduleTemplate(minutes)
  }

  if ('showCumulativeBalance' in value) {
    if (typeof value.showCumulativeBalance !== 'boolean') return 'Configuração de acumulado inválida'
    patch.showCumulativeBalance = value.showCumulativeBalance
  }

  if ('cumulativeBalanceScope' in value) {
    if (!isCumulativeBalanceScope(value.cumulativeBalanceScope)) return 'Dimensão do acumulado inválida'
    patch.cumulativeBalanceScope = value.cumulativeBalanceScope
  }

  if ('cumulativeStartDate' in value) {
    const date = parseDateOnly(value.cumulativeStartDate)
    if (!date) return 'Data inicial do acumulado inválida'
    patch.cumulativeStartDate = date
  }

  if ('accentPreset' in value) {
    if (!isAccentPreset(value.accentPreset)) return 'Preset visual inválido'
    patch.accentPreset = value.accentPreset
  }

  if ('themeMode' in value) {
    if (!isThemeMode(value.themeMode)) return 'Tema inválido'
    patch.themeMode = value.themeMode
  }

  if ('weekStartDay' in value) {
    if (!isWeekStartDay(value.weekStartDay)) return 'Dia de início de semana inválido'
    patch.weekStartDay = value.weekStartDay
  }

  if ('architecturalPreset' in value) {
    if (value.architecturalPreset !== null && !isArchitecturalPreset(value.architecturalPreset)) {
      return 'Preset arquitetônico inválido'
    }
    patch.architecturalPreset = value.architecturalPreset as ArchitecturalPreset | null
  }

  if ('density' in value) {
    if (!isDensityPreset(value.density)) return 'Densidade inválida'
    patch.density = value.density
  }

  return patch
}

export async function updateUserSettings(
  userId: string,
  patch: SettingsPatch
): Promise<SerializedUserSettings> {
  await getOrCreateUserSettings(userId)
  const updated = await prisma.userSettings.update({
    where: { userId },
    data: {
      ...(patch.workMinutesByWeekday ? { workMinutesByWeekday: patch.workMinutesByWeekday } : {}),
      ...(patch.workScheduleTemplate ? { workScheduleTemplate: patch.workScheduleTemplate } : {}),
      ...(patch.showCumulativeBalance !== undefined
        ? { showCumulativeBalance: patch.showCumulativeBalance }
        : {}),
      ...(patch.cumulativeBalanceScope ? { cumulativeBalanceScope: patch.cumulativeBalanceScope } : {}),
      ...(patch.cumulativeStartDate ? { cumulativeStartDate: toDateOnlyUTC(patch.cumulativeStartDate) } : {}),
      ...(patch.accentPreset ? { accentPreset: patch.accentPreset } : {}),
      ...(patch.themeMode ? { themeMode: patch.themeMode } : {}),
      ...(patch.weekStartDay ? { weekStartDay: patch.weekStartDay } : {}),
      ...(patch.architecturalPreset !== undefined ? { architecturalPreset: patch.architecturalPreset } : {}),
      ...(patch.density ? { density: patch.density } : {}),
    },
  })
  return serialize(updated)
}

export const settingsOptions = {
  workScheduleTemplates: WORK_SCHEDULE_TEMPLATES,
  cumulativeBalanceScopes: CUMULATIVE_BALANCE_SCOPES,
  accentPresets: ACCENT_PRESETS,
  themeModes: THEME_MODES,
}

export type SettingsOptions = typeof settingsOptions
