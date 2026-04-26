import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMonthRangeBRT, splitIntervalByLocalDay } from '@/lib/dates'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { parseMonth, parsePage } from '@/lib/server/validation'

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = parseMonth(searchParams.get('month'))
  if (!month) {
    return NextResponse.json({ error: 'Mês inválido. Use YYYY-MM.' }, { status: 400 })
  }
  const page = parsePage(searchParams.get('page'), 1, 10000)
  const pageSize = parsePage(searchParams.get('pageSize'), 50, 200)
  const { start, end, startDate, endDate } = getMonthRangeBRT(month)

  const entries = await prisma.clockEntry.findMany({
    where: {
      userId: user.id,
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

  return NextResponse.json({
    entries: paged,
    totalMinutes,
    sessionCount: segments.length,
    page,
    pageSize,
    hasMore: offset + pageSize < segments.length,
  })
}
