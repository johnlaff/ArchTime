import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') ?? new Date().toISOString().slice(0, 7)

  // Parse YYYY-MM into UTC month boundaries
  const [year, monthNum] = month.split('-').map(Number)
  const start = new Date(Date.UTC(year, monthNum - 1, 1))
  const end = new Date(Date.UTC(year, monthNum, 1))

  const entries = await prisma.clockEntry.findMany({
    where: {
      userId: user.id,
      entryDate: { gte: start, lt: end },
      clockOut: { not: null },
    },
    include: {
      allocations: {
        include: { project: { select: { name: true, color: true } } },
        take: 1,
      },
    },
    orderBy: { clockIn: 'desc' },
  })

  const mapped = entries.map((e) => ({
    id: e.id,
    clockIn: e.clockIn.toISOString(),
    clockOut: e.clockOut!.toISOString(),
    totalMinutes: e.totalMinutes,
    projectName: e.allocations[0]?.project.name ?? null,
    projectColor: e.allocations[0]?.project.color ?? null,
    projectId: e.allocations[0]?.projectId ?? null,
    entryDate: e.entryDate.toISOString(),
    source: e.source,
  }))

  const totalMinutes = mapped.reduce((s, e) => s + (e.totalMinutes ?? 0), 0)

  return NextResponse.json({
    entries: mapped,
    totalMinutes,
    sessionCount: mapped.length,
  })
}
