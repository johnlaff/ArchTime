import { prisma } from '@/lib/prisma'
import {
  calculateExpectedMinutes,
  getLocalDateBRT,
  getMonthRangeBRT,
  getWeekRangesForMonth,
  splitIntervalByLocalDay,
  startOfLocalDayBRT,
  endExclusiveOfLocalDayBRT,
  toDateOnlyUTC,
} from '@/lib/dates'
import { DEFAULT_WORK_HOURS } from '@/lib/constants'
import { DEFAULT_WORK_MINUTES_BY_WEEKDAY, type WorkMinutesByWeekday } from '@/lib/preferences'
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

async function getWorkMinutesByWeekday(
  userId: string,
  defaultWorkHours?: number,
  settings?: SerializedUserSettings
): Promise<WorkMinutesByWeekday> {
  if (settings) return settings.workMinutesByWeekday
  if (defaultWorkHours != null) return workMinutesFromDefaultHours(defaultWorkHours)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultWorkHours: true },
  })
  if (!user) return DEFAULT_WORK_MINUTES_BY_WEEKDAY
  return workMinutesFromDefaultHours(user.defaultWorkHours ?? DEFAULT_WORK_HOURS)
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

export async function buildPeriodBalance(
  userId: string,
  startDate: string,
  endDate: string,
  defaultWorkHours?: number,
  options: { settings?: SerializedUserSettings; entries?: ClockEntryInterval[] } = {}
): Promise<PeriodBalance> {
  const workMinutesByWeekday = await getWorkMinutesByWeekday(
    userId,
    defaultWorkHours,
    options.settings
  )
  const entries = options.entries ?? await fetchClosedEntries(
    userId,
    startOfLocalDayBRT(startDate),
    endExclusiveOfLocalDayBRT(endDate)
  )

  return buildPeriodBalanceFromEntries(entries, startDate, endDate, workMinutesByWeekday)
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7)
}

function laterDate(a: string, b: string): string {
  return a > b ? a : b
}

function getCumulativeRange(
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
      startDate = `${shiftMonth(month, -2)}-01`
      break
    case 'rolling_6_months':
      startDate = `${shiftMonth(month, -5)}-01`
      break
    case 'rolling_12_months':
      startDate = `${shiftMonth(month, -11)}-01`
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
  const weeks = getWeekRangesForMonth(month, weekStartDay).map((range) =>
    buildPeriodBalanceFromEntries(monthEntries, range.startDate, range.endDate, workMinutesByWeekday)
  )

  let cumulativeBalance: number | null = null
  if (settings.showCumulativeBalance) {
    const range = getCumulativeRange(month, settings)
    const cumulativeEntries = range.startDate === startDate
      ? monthEntries
      : await fetchClosedEntries(
        userId,
        startOfLocalDayBRT(range.startDate),
        endExclusiveOfLocalDayBRT(range.endDate)
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
