import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import {
  addDaysToDateString,
  endExclusiveOfLocalDayBRT,
  getDayOfWeek,
  getLocalDateBRT,
  getWeekRangeBRT,
  splitIntervalByLocalDay,
  startOfLocalDayBRT,
} from '@/lib/dates'
import type { HeatmapDay } from '@/types'

/** Heatmap intensity from worked minutes in a local day (spec thresholds). */
function heatLevel(minutes: number): HeatmapDay['level'] {
  if (minutes < 1) return 0
  if (minutes < 180) return 1 // < 3h
  if (minutes < 360) return 2 // 3–6h
  if (minutes < 540) return 3 // 6–9h
  return 4 // 9h+
}

function topProjectOf(projects: Map<string, number>): string | null {
  let best: string | null = null
  let bestMinutes = 0
  for (const [name, minutes] of projects) {
    if (minutes > bestMinutes) {
      best = name
      bestMinutes = minutes
    }
  }
  return best
}

/**
 * Per-local-day worked minutes for the last `weeks` weeks (contiguous, including
 * zero days), split by BRT day so sessions crossing midnight land on the right day
 * — same `splitIntervalByLocalDay` the history uses, keeping totals consistent.
 */
export async function fetchHeatmapDays(userId: string, weeks: number): Promise<HeatmapDay[]> {
  'use cache'
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  cacheTag(`sidebar-${userId}`)

  const todayDate = getLocalDateBRT()
  const startDate = addDaysToDateString(todayDate, -(weeks * 7 - 1))
  const rangeStart = startOfLocalDayBRT(startDate)
  const rangeEnd = endExclusiveOfLocalDayBRT(todayDate)

  const entries = await prisma.clockEntry.findMany({
    where: {
      userId,
      deletedAt: null,
      clockOut: { not: null, gt: rangeStart },
      clockIn: { lt: rangeEnd },
    },
    include: {
      allocations: { include: { project: { select: { name: true } } }, take: 1 },
    },
    orderBy: { clockIn: 'asc' },
  })

  const byDate = new Map<
    string,
    { minutes: number; sessions: number; projects: Map<string, number> }
  >()

  for (const entry of entries) {
    const projectName = entry.allocations[0]?.project.name ?? null
    const daysHit = new Set<string>()
    for (const seg of splitIntervalByLocalDay(entry.clockIn, entry.clockOut!)) {
      if (seg.date < startDate || seg.date > todayDate) continue
      const bucket = byDate.get(seg.date) ?? { minutes: 0, sessions: 0, projects: new Map() }
      bucket.minutes += seg.minutes
      if (projectName) {
        bucket.projects.set(projectName, (bucket.projects.get(projectName) ?? 0) + seg.minutes)
      }
      byDate.set(seg.date, bucket)
      daysHit.add(seg.date)
    }
    for (const date of daysHit) byDate.get(date)!.sessions += 1
  }

  const days: HeatmapDay[] = []
  let cursor = startDate
  while (cursor <= todayDate) {
    const bucket = byDate.get(cursor)
    const minutes = bucket?.minutes ?? 0
    days.push({
      date: cursor,
      totalMinutes: minutes,
      sessionCount: bucket?.sessions ?? 0,
      topProject: bucket ? topProjectOf(bucket.projects) : null,
      level: heatLevel(minutes),
    })
    cursor = addDaysToDateString(cursor, 1)
  }
  return days
}

/** Worked minutes for each of the 7 days of the current week (goal merged later). */
export async function fetchWeekMinutes(
  userId: string,
  weekStartDay: 0 | 1
): Promise<Array<{ date: string; weekday: number; totalMinutes: number }>> {
  'use cache'
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  cacheTag(`sidebar-${userId}`)

  const { startDate, start, end } = getWeekRangeBRT(new Date(), weekStartDay)
  const entries = await prisma.clockEntry.findMany({
    where: {
      userId,
      deletedAt: null,
      clockOut: { not: null, gt: start },
      clockIn: { lt: end },
    },
    select: { clockIn: true, clockOut: true },
  })

  const byDate = new Map<string, number>()
  for (const entry of entries) {
    for (const seg of splitIntervalByLocalDay(entry.clockIn, entry.clockOut!)) {
      if (seg.date < startDate) continue
      byDate.set(seg.date, (byDate.get(seg.date) ?? 0) + seg.minutes)
    }
  }

  const out: Array<{ date: string; weekday: number; totalMinutes: number }> = []
  let cursor = startDate
  for (let i = 0; i < 7; i++) {
    out.push({ date: cursor, weekday: getDayOfWeek(cursor), totalMinutes: byDate.get(cursor) ?? 0 })
    cursor = addDaysToDateString(cursor, 1)
  }
  return out
}
