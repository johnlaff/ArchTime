import { prisma } from '@/lib/prisma'
import {
  endExclusiveOfLocalDayBRT,
  getLocalDateBRT,
  getMonthRangeBRT,
  getWeekRangeBRT,
  splitIntervalByLocalDay,
  startOfLocalDayBRT,
} from '@/lib/dates'
import {
  buildHourBankMonth,
  buildPeriodBalanceFromEntries,
  type ClockEntryInterval,
} from '@/lib/hour-bank'
import { getOrCreateUserSettings } from '@/lib/user-settings'
import type { DailySummary } from '@/types'

function earlierDate(a: Date, b: Date): Date {
  return a < b ? a : b
}

function laterDate(a: Date, b: Date): Date {
  return a > b ? a : b
}

export async function buildDailySummary(userId: string): Promise<DailySummary> {
  const settings = await getOrCreateUserSettings(userId)
  const weekStartDay = settings.weekStartDay === 'sunday' ? 0 : 1

  const todayDate = getLocalDateBRT()
  const todayStart = startOfLocalDayBRT(todayDate)
  const todayEnd = endExclusiveOfLocalDayBRT(todayDate)
  const week = getWeekRangeBRT(new Date(), weekStartDay)
  const month = getMonthRangeBRT(todayDate.slice(0, 7))
  const balanceStart = earlierDate(week.start, month.start)
  const balanceEnd = laterDate(week.end, month.end)

  const todayEntryWhere = {
    userId,
    deletedAt: null,
    clockOut: { not: null },
    clockIn: { lt: todayEnd },
    AND: [{ clockOut: { gt: todayStart } }],
  }

  const [recentEntries, sessionCount, balanceEntries] = await Promise.all([
    prisma.clockEntry.findMany({
      where: todayEntryWhere,
      include: {
        allocations: {
          include: { project: { select: { name: true, color: true } } },
          take: 1,
        },
      },
      orderBy: { clockIn: 'desc' },
      take: 10,
    }),
    prisma.clockEntry.count({ where: todayEntryWhere }),
    prisma.clockEntry.findMany({
      where: {
        userId,
        deletedAt: null,
        clockOut: { not: null, gt: balanceStart },
        clockIn: { lt: balanceEnd },
      },
      select: { clockIn: true, clockOut: true },
    }),
  ])

  const intervals: ClockEntryInterval[] = balanceEntries
  const today = buildPeriodBalanceFromEntries(
    intervals,
    todayDate,
    todayDate,
    settings.workMinutesByWeekday
  )
  const weekBalance = buildPeriodBalanceFromEntries(
    intervals,
    week.startDate,
    week.endDate,
    settings.workMinutesByWeekday
  )
  const monthBalance = await buildHourBankMonth(userId, todayDate.slice(0, 7), {
    settings,
    entries: intervals,
  })

  return {
    totalMinutes: today.actualMinutes,
    sessionCount,
    today,
    week: weekBalance,
    month: {
      expectedMinutes: monthBalance.expectedMinutes,
      actualMinutes: monthBalance.actualMinutes,
      balanceMinutes: monthBalance.balanceMinutes,
      cumulativeBalance: monthBalance.cumulativeBalance,
      showCumulativeBalance: monthBalance.showCumulativeBalance,
    },
    entries: recentEntries.map((entry) => {
      const dayMinutes = splitIntervalByLocalDay(entry.clockIn, entry.clockOut!)
        .filter((segment) => segment.date === todayDate)
        .reduce((sum, segment) => sum + segment.minutes, 0)

      return {
        id: entry.id,
        clockIn: entry.clockIn.toISOString(),
        clockOut: entry.clockOut?.toISOString() ?? null,
        totalMinutes: dayMinutes,
        projectName: entry.allocations[0]?.project.name ?? null,
        projectColor: entry.allocations[0]?.project.color ?? null,
        activityType: entry.activityType,
        notes: entry.notes,
      }
    }),
  }
}
