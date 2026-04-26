import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  endExclusiveOfLocalDayBRT,
  getLocalDateBRT,
  getMonthRangeBRT,
  getWeekRangeBRT,
  splitIntervalByLocalDay,
  startOfLocalDayBRT,
} from '@/lib/dates'
import { buildHourBankMonth, buildPeriodBalance } from '@/lib/hour-bank'
import { getAuthenticatedUser } from '@/lib/server/auth'
import type { DailySummary } from '@/types'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const todayDate = getLocalDateBRT()
  const todayStart = startOfLocalDayBRT(todayDate)
  const todayEnd = endExclusiveOfLocalDayBRT(todayDate)
  const week = getWeekRangeBRT()
  const month = getMonthRangeBRT(todayDate.slice(0, 7))

  const entries = await prisma.clockEntry.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      clockOut: { not: null },
      clockIn: { lt: todayEnd },
      AND: [{ clockOut: { gt: todayStart } }],
    },
    include: {
      allocations: {
        include: { project: { select: { name: true, color: true } } },
        take: 1,
      },
    },
    orderBy: { clockIn: 'desc' },
  })

  const [today, weekBalance, monthBalance] = await Promise.all([
    buildPeriodBalance(user.id, todayDate, todayDate),
    buildPeriodBalance(user.id, week.startDate, week.endDate),
    buildHourBankMonth(user.id, todayDate.slice(0, 7)),
  ])

  const summary: DailySummary = {
    totalMinutes: today.actualMinutes,
    sessionCount: entries.length,
    today,
    week: weekBalance,
    month: {
      expectedMinutes: monthBalance.expectedMinutes,
      actualMinutes: monthBalance.actualMinutes,
      balanceMinutes: monthBalance.balanceMinutes,
      cumulativeBalance: monthBalance.cumulativeBalance,
    },
    entries: entries.slice(0, 10).map((entry) => {
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
      }
    }),
  }

  return NextResponse.json(summary)
}
