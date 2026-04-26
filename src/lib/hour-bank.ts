import { prisma } from '@/lib/prisma'
import {
  calculateExpectedMinutes,
  getMonthRangeBRT,
  getWeekRangesForMonth,
  splitIntervalByLocalDay,
  startOfLocalDayBRT,
  endExclusiveOfLocalDayBRT,
  toDateOnlyUTC,
} from '@/lib/dates'
import { DEFAULT_WORK_HOURS } from '@/lib/constants'

export interface PeriodBalance {
  startDate: string
  endDate: string
  expectedMinutes: number
  actualMinutes: number
  balanceMinutes: number
}

export interface HourBankMonth extends PeriodBalance {
  month: string
  cumulativeBalance: number
  weeks: PeriodBalance[]
}

async function getDefaultWorkHours(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultWorkHours: true },
  })
  return user?.defaultWorkHours ?? DEFAULT_WORK_HOURS
}

export async function buildPeriodBalance(
  userId: string,
  startDate: string,
  endDate: string,
  defaultWorkHours?: number
): Promise<PeriodBalance> {
  const workHours = defaultWorkHours ?? await getDefaultWorkHours(userId)
  const start = startOfLocalDayBRT(startDate)
  const end = endExclusiveOfLocalDayBRT(endDate)

  const entries = await prisma.clockEntry.findMany({
    where: {
      userId,
      deletedAt: null,
      clockOut: { not: null, gt: start },
      clockIn: { lt: end },
    },
    select: { clockIn: true, clockOut: true },
  })

  const actualMinutes = entries.reduce((sum, entry) => {
    if (!entry.clockOut) return sum
    const segments = splitIntervalByLocalDay(entry.clockIn, entry.clockOut)
    return sum + segments.reduce((inner, segment) => {
      if (segment.date < startDate || segment.date > endDate) return inner
      return inner + segment.minutes
    }, 0)
  }, 0)

  const expectedMinutes = calculateExpectedMinutes({
    startDate,
    endDate,
    defaultWorkHours: workHours,
  })

  return {
    startDate,
    endDate,
    expectedMinutes,
    actualMinutes,
    balanceMinutes: actualMinutes - expectedMinutes,
  }
}

export async function buildHourBankMonth(
  userId: string,
  month: string,
  options: { persist?: boolean; defaultWorkHours?: number } = {}
): Promise<HourBankMonth> {
  const workHours = options.defaultWorkHours ?? await getDefaultWorkHours(userId)
  const { startDate, endDate } = getMonthRangeBRT(month)
  const monthBalance = await buildPeriodBalance(userId, startDate, endDate, workHours)
  const weeks = await Promise.all(
    getWeekRangesForMonth(month).map((range) =>
      buildPeriodBalance(userId, range.startDate, range.endDate, workHours)
    )
  )

  const previous = await prisma.hourBank.findFirst({
    where: { userId, month: { lt: toDateOnlyUTC(startDate) } },
    orderBy: { month: 'desc' },
    select: { cumulativeBalance: true },
  })
  const cumulativeBalance = (previous?.cumulativeBalance ?? 0) + monthBalance.balanceMinutes

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
        cumulativeBalance,
      },
      update: {
        expectedMinutes: monthBalance.expectedMinutes,
        actualMinutes: monthBalance.actualMinutes,
        balanceMinutes: monthBalance.balanceMinutes,
        cumulativeBalance,
      },
    })
  }

  return {
    ...monthBalance,
    month,
    cumulativeBalance,
    weeks,
  }
}

export async function recalculateHourBankForInterval(
  userId: string,
  clockIn: Date,
  clockOut: Date | null
): Promise<void> {
  if (!clockOut) return
  const months = new Set(
    splitIntervalByLocalDay(clockIn, clockOut).map((segment) => segment.date.slice(0, 7))
  )

  await Promise.all(
    Array.from(months).map((month) =>
      buildHourBankMonth(userId, month, { persist: true })
    )
  )
}
