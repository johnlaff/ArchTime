import { prisma } from '@/lib/prisma'
import { getMonthRangeBRT, splitIntervalByLocalDay } from '@/lib/dates'
import { buildHourBankMonth, type ClockEntryInterval, type HourBankMonth } from '@/lib/hour-bank'
import { getOrCreateUserSettings, type SerializedUserSettings } from '@/lib/user-settings'
import type { HistoryData, ProjectOption } from '@/types'

function serializeProject(project: {
  id: string
  name: string
  clientName: string | null
  color: string
  hourlyRate: unknown
  isActive: boolean
}): ProjectOption {
  return {
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    color: project.color,
    hourlyRate: project.hourlyRate == null ? null : Number(project.hourlyRate),
    isActive: project.isActive,
  }
}

export interface HistoryBundle {
  history: HistoryData
  projects: ProjectOption[]
  hourBank: HourBankMonth
  settings: SerializedUserSettings
}

export async function buildHistoryData(
  userId: string,
  month: string,
  page = 1,
  pageSize = 50
): Promise<{ history: HistoryData; intervals: ClockEntryInterval[] }> {
  const { start, end, startDate, endDate } = getMonthRangeBRT(month)

  const entries = await prisma.clockEntry.findMany({
    where: {
      userId,
      deletedAt: null,
      clockOut: { not: null },
      clockIn: { lt: end },
      AND: [{ clockOut: { gt: start } }],
    },
    include: {
      allocations: {
        include: { project: { select: { name: true, color: true } } },
        take: 1,
      },
    },
    orderBy: { clockIn: 'desc' },
  })

  const segments = entries.flatMap((entry) => {
    const allSegments = splitIntervalByLocalDay(entry.clockIn, entry.clockOut!)
    const entrySegments = allSegments
      .filter((segment) => segment.date >= startDate && segment.date <= endDate)

    return entrySegments.map((segment) => ({
      id: `${entry.id}:${segment.date}`,
      entryId: entry.id,
      clockIn: entry.clockIn.toISOString(),
      clockOut: entry.clockOut!.toISOString(),
      segmentDate: segment.date,
      segmentMinutes: segment.minutes,
      totalEntryMinutes: entry.totalMinutes,
      totalMinutes: segment.minutes,
      isPartial: allSegments.length > 1 || segment.minutes !== entry.totalMinutes,
      projectName: entry.allocations[0]?.project.name ?? null,
      projectColor: entry.allocations[0]?.project.color ?? null,
      projectId: entry.allocations[0]?.projectId ?? null,
      entryDate: segment.date,
      source: entry.source,
    }))
  }).sort((a, b) => {
    const dateOrder = b.segmentDate.localeCompare(a.segmentDate)
    if (dateOrder !== 0) return dateOrder
    return b.clockIn.localeCompare(a.clockIn)
  })

  const totalMinutes = segments.reduce((sum, entry) => sum + entry.segmentMinutes, 0)
  const offset = (page - 1) * pageSize
  const paged = segments.slice(offset, offset + pageSize)

  return {
    history: {
      entries: paged,
      totalMinutes,
      sessionCount: segments.length,
      page,
      pageSize,
      hasMore: offset + pageSize < segments.length,
    },
    intervals: entries.map((entry) => ({
      clockIn: entry.clockIn,
      clockOut: entry.clockOut,
    })),
  }
}

export async function buildHistoryBundle(
  userId: string,
  month: string,
  page = 1,
  pageSize = 50
): Promise<HistoryBundle> {
  const [settings, historyResult, projects] = await Promise.all([
    getOrCreateUserSettings(userId),
    buildHistoryData(userId, month, page, pageSize),
    prisma.project.findMany({
      where: { userId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    }),
  ])

  const hourBank = await buildHourBankMonth(userId, month, {
    settings,
    entries: historyResult.intervals,
  })

  return {
    history: historyResult.history,
    projects: projects.map(serializeProject),
    hourBank,
    settings,
  }
}
