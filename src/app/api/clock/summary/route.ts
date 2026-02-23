import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'
import { getLocalDate } from '@/lib/dates'
import type { DailySummary } from '@/types'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date(getLocalDate() + 'T00:00:00.000Z')

  const entries = await prisma.clockEntry.findMany({
    where: {
      userId: user.id,
      entryDate: today,
      clockOut: { not: null },
    },
    include: {
      allocations: {
        include: { project: { select: { name: true, color: true } } },
        take: 1,
      },
    },
    orderBy: { clockIn: 'desc' },
    take: 10,
  })

  const totalMinutes = entries.reduce((sum, e) => sum + (e.totalMinutes ?? 0), 0)

  const summary: DailySummary = {
    totalMinutes,
    sessionCount: entries.length,
    entries: entries.map(e => ({
      id: e.id,
      clockIn: e.clockIn.toISOString(),
      clockOut: e.clockOut?.toISOString() ?? null,
      totalMinutes: e.totalMinutes,
      projectName: e.allocations[0]?.project.name ?? null,
      projectColor: e.allocations[0]?.project.color ?? null,
    })),
  }

  return NextResponse.json(summary)
}
