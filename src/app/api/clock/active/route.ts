import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'
import type { ActiveSession } from '@/types'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = await prisma.clockEntry.findFirst({
    where: { userId: user.id, clockOut: null },
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
