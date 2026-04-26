import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import type { ActiveSession } from '@/types'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = await prisma.clockEntry.findFirst({
    where: { userId: user.id, clockOut: null, deletedAt: null },
    include: {
      allocations: {
        include: { project: { select: { name: true, color: true } } },
        take: 1,
      },
    },
    orderBy: { clockIn: 'desc' },
  })

  if (!entry) return NextResponse.json(null)

  const allocation = entry.allocations[0]
  const session: ActiveSession = {
    id: entry.id,
    clockIn: entry.clockIn.toISOString(),
    projectId: allocation?.projectId ?? null,
    projectName: allocation?.project.name ?? null,
    projectColor: allocation?.project.color ?? null,
  }

  return NextResponse.json(session)
}
