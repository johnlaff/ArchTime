import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import {
  addMonthsToMonthKey,
  calculateExpectedMinutes,
  getLocalDateBRT,
  getMonthRangeBRT,
  getWeekRangesForMonth,
  splitIntervalByLocalDay,
  startOfLocalDayBRT,
  endExclusiveOfLocalDayBRT,
  toDateOnlyUTC,
} from '@/lib/dates'
import type { WorkMinutesByWeekday } from '@/lib/preferences'
import { getOrCreateUserSettings, type SerializedUserSettings } from '@/lib/user-settings'

export interface ClockEntryInterval {
  clockIn: Date
  clockOut: Date | null
}

export interface PeriodBalance {
  startDate: string
  endDate: string
  expectedMinutes: number
  actualMinutes: number
  balanceMinutes: number
}

export interface HourBankMonth extends PeriodBalance {
  month: string
  cumulativeBalance: number | null
  showCumulativeBalance: boolean
  cumulativeBalanceScope: SerializedUserSettings['cumulativeBalanceScope']
  cumulativeStartDate: string
  weeks: PeriodBalance[]
}

function workMinutesFromDefaultHours(defaultWorkHours: number): WorkMinutesByWeekday {
  const minutes = Math.round(defaultWorkHours * 60)
  return { '0': 0, '1': minutes, '2': minutes, '3': minutes, '4': minutes, '5': minutes, '6': 0 }
}

function getActualMinutesForPeriod(
  entries: ClockEntryInterval[],
  startDate: string,
  endDate: string
): number {
  return entries.reduce((sum, entry) => {
    if (!entry.clockOut) return sum
    const segments = splitIntervalByLocalDay(entry.clockIn, entry.clockOut)
    return sum + segments.reduce((inner, segment) => {
      if (segment.date < startDate || segment.date > endDate) return inner
      return inner + segment.minutes
    }, 0)
  }, 0)
}

export function buildPeriodBalanceFromEntries(
  entries: ClockEntryInterval[],
  startDate: string,
  endDate: string,
  workMinutesByWeekday: WorkMinutesByWeekday
): PeriodBalance {
  const actualMinutes = getActualMinutesForPeriod(entries, startDate, endDate)
  const expectedMinutes = calculateExpectedMinutes({
    startDate,
    endDate,
    workMinutesByWeekday,
  })

  return {
    startDate,
    endDate,
    expectedMinutes,
    actualMinutes,
    balanceMinutes: actualMinutes - expectedMinutes,
  }
}

async function fetchClosedEntries(
  userId: string,
  start: Date,
  end: Date
): Promise<ClockEntryInterval[]> {
  return prisma.clockEntry.findMany({
    where: {
      userId,
      deletedAt: null,
      clockOut: { not: null, gt: start },
      clockIn: { lt: end },
    },
    select: { clockIn: true, clockOut: true },
  })
}

function laterDate(a: string, b: string): string {
  return a > b ? a : b
}

export function getCumulativeRange(
  month: string,
  settings: SerializedUserSettings
): { startDate: string; endDate: string } {
  const { endDate } = getMonthRangeBRT(month)
  let startDate: string

  switch (settings.cumulativeBalanceScope) {
    case 'year_to_date':
      startDate = `${month.slice(0, 4)}-01-01`
      break
    case 'rolling_3_months':
      startDate = `${addMonthsToMonthKey(month, -2)}-01`
      break
    case 'rolling_6_months':
      startDate = `${addMonthsToMonthKey(month, -5)}-01`
      break
    case 'rolling_12_months':
      startDate = `${addMonthsToMonthKey(month, -11)}-01`
      break
    case 'since_start':
    default:
      startDate = settings.cumulativeStartDate
      break
  }

  return {
    startDate: laterDate(startDate, settings.cumulativeStartDate),
    endDate,
  }
}

export async function buildHourBankMonth(
  userId: string,
  month: string,
  options: {
    persist?: boolean
    defaultWorkHours?: number
    settings?: SerializedUserSettings
    entries?: ClockEntryInterval[]
    computeWeeks?: boolean
    cumulativeEntries?: ClockEntryInterval[]
  } = {}
): Promise<HourBankMonth> {
  const settings = options.settings ?? await getOrCreateUserSettings(userId)
  const workMinutesByWeekday = options.defaultWorkHours != null
    ? workMinutesFromDefaultHours(options.defaultWorkHours)
    : settings.workMinutesByWeekday
  const { start, end, startDate, endDate } = getMonthRangeBRT(month)
  const monthEntries = options.entries ?? await fetchClosedEntries(userId, start, end)

  const monthBalance = buildPeriodBalanceFromEntries(
    monthEntries,
    startDate,
    endDate,
    workMinutesByWeekday
  )
  const weekStartDay = settings.weekStartDay === 'sunday' ? 0 : 1
  // O dashboard não consome `weeks` (só o histórico) — computeWeeks: false evita
  // filtrar splitIntervalByLocalDay sobre todas as entries 4-5 vezes por load.
  const computeWeeks = options.computeWeeks !== false
  const weeks = computeWeeks
    ? getWeekRangesForMonth(month, weekStartDay).map((range) =>
        buildPeriodBalanceFromEntries(monthEntries, range.startDate, range.endDate, workMinutesByWeekday)
      )
    : []

  let cumulativeBalance: number | null = null
  if (settings.showCumulativeBalance) {
    const range = getCumulativeRange(month, settings)
    // Quando o caller já traz as entries do range acumulado (dashboard passa a query
    // única alargada), reusa-as em vez de disparar um 2º fetch sequencial.
    const cumulativeEntries = options.cumulativeEntries ?? (
      range.startDate === startDate
        ? monthEntries
        : await fetchClosedEntries(
          userId,
          startOfLocalDayBRT(range.startDate),
          endExclusiveOfLocalDayBRT(range.endDate)
        )
    )
    cumulativeBalance = buildPeriodBalanceFromEntries(
      cumulativeEntries,
      range.startDate,
      range.endDate,
      workMinutesByWeekday
    ).balanceMinutes
  }

  if (options.persist) {
    await prisma.hourBank.upsert({
      where: {
        userId_month: {
          userId,
          month: toDateOnlyUTC(startDate),
        },
      },
      create: {
        userId,
        month: toDateOnlyUTC(startDate),
        expectedMinutes: monthBalance.expectedMinutes,
        actualMinutes: monthBalance.actualMinutes,
        balanceMinutes: monthBalance.balanceMinutes,
        cumulativeBalance: cumulativeBalance ?? monthBalance.balanceMinutes,
      },
      update: {
        expectedMinutes: monthBalance.expectedMinutes,
        actualMinutes: monthBalance.actualMinutes,
        balanceMinutes: monthBalance.balanceMinutes,
        cumulativeBalance: cumulativeBalance ?? monthBalance.balanceMinutes,
      },
    })
  }

  return {
    ...monthBalance,
    month,
    cumulativeBalance,
    showCumulativeBalance: settings.showCumulativeBalance,
    cumulativeBalanceScope: settings.cumulativeBalanceScope,
    cumulativeStartDate: settings.cumulativeStartDate,
    weeks,
  }
}

export async function recalculateHourBankForInterval(
  userId: string,
  clockIn: Date,
  clockOut: Date | null
): Promise<void> {
  if (!clockOut) return
  const settings = await getOrCreateUserSettings(userId)
  const months = new Set(
    splitIntervalByLocalDay(clockIn, clockOut).map((segment) => segment.date.slice(0, 7))
  )

  if (settings.showCumulativeBalance) {
    const currentMonth = getLocalDateBRT().slice(0, 7)
    months.add(currentMonth)
  }

  await Promise.all(
    Array.from(months).map((month) =>
      buildHourBankMonth(userId, month, { persist: true, settings })
    )
  )
}

/**
 * Versão fail-safe do recálculo: o hour_bank é cache derivado (AGENTS.md) e
 * roda DEPOIS do commit da mutação primária — uma falha transitória aqui não
 * pode virar 500 para uma escrita que já persistiu (o cliente reverteria a UI
 * para um estado que o banco já superou). O erro é logado e engolido; o
 * próximo recálculo dos mesmos meses se autocorrige.
 */
export async function safeRecalculateHourBankForInterval(
  userId: string,
  clockIn: Date,
  clockOut: Date | null
): Promise<void> {
  try {
    await recalculateHourBankForInterval(userId, clockIn, clockOut)
  } catch (error) {
    console.error('[hour-bank] recálculo falhou (mutação primária já commitada)', {
      userId,
      clockIn: clockIn.toISOString(),
      clockOut: clockOut?.toISOString() ?? null,
      error,
    })
    // O erro é engolido de propósito, mas não pode ficar invisível: reporta ao Sentry.
    Sentry.captureException(error, { extra: { scope: 'hour-bank:interval', userId } })
  }
}

/**
 * Recálculo de múltiplos intervalos deduplicando os meses afetados: uma edição de
 * ponto no mesmo mês (caso comum) faz `buildHourBankMonth` + `upsert` uma vez por mês
 * único, não uma vez por intervalo. Evita o trabalho redundante de dois recálculos
 * sobrepostos no PATCH.
 */
export async function recalculateHourBankForIntervals(
  userId: string,
  intervals: Array<{ clockIn: Date; clockOut: Date | null }>
): Promise<void> {
  const settings = await getOrCreateUserSettings(userId)
  const months = new Set<string>()
  for (const { clockIn, clockOut } of intervals) {
    if (!clockOut) continue
    for (const segment of splitIntervalByLocalDay(clockIn, clockOut)) {
      months.add(segment.date.slice(0, 7))
    }
  }

  if (settings.showCumulativeBalance) {
    months.add(getLocalDateBRT().slice(0, 7))
  }

  await Promise.all(
    Array.from(months).map((month) =>
      buildHourBankMonth(userId, month, { persist: true, settings })
    )
  )
}

export async function safeRecalculateHourBankForIntervals(
  userId: string,
  intervals: Array<{ clockIn: Date; clockOut: Date | null }>
): Promise<void> {
  try {
    await recalculateHourBankForIntervals(userId, intervals)
  } catch (error) {
    console.error('[hour-bank] recálculo falhou (mutação primária já commitada)', {
      userId,
      error,
    })
    // O erro é engolido de propósito, mas não pode ficar invisível: reporta ao Sentry.
    Sentry.captureException(error, { extra: { scope: 'hour-bank:intervals', userId } })
  }
}
