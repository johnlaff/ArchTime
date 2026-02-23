import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'
import { getLocalDate } from '@/lib/dates'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Garante que não existe sessão aberta
  const existing = await prisma.clockEntry.findFirst({
    where: { userId: user.id, clockOut: null },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'Já existe uma entrada em aberto', entryId: existing.id },
      { status: 409 }
    )
  }

  const body = await req.json()
  const { projectId } = body
  const now = new Date()
  const entryDate = new Date(getLocalDate(now) + 'T00:00:00.000Z')

  const entry = await prisma.$transaction(async (tx) => {
    const clockEntry = await tx.clockEntry.create({
      data: {
        userId: user.id,
        clockIn: now,
        entryDate,
        source: 'web',
      },
    })

    if (projectId) {
      await tx.timeAllocation.create({
        data: { clockEntryId: clockEntry.id, projectId, minutes: 0 },
      })
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'clock_in',
        entityId: clockEntry.id,
        newData: { clockIn: now.toISOString(), projectId: projectId ?? null },
        userAgent: req.headers.get('user-agent'),
      },
    })

    return clockEntry
  })

  return NextResponse.json(entry, { status: 201 })
}
