import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'
import { generateEntryHash } from '@/lib/hash'
import { calcDurationMinutes } from '@/lib/dates'
import type { PendingEntry } from '@/types'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry: PendingEntry = await req.json()

  if (entry.type === 'clock_in') {
    const clockIn = new Date(entry.timestamp)
    const entryDate = new Date(entry.timestamp)
    const clockEntryId = entry.entryId ?? entry.id

    await prisma.clockEntry.create({
      data: {
        id: clockEntryId,
        userId: user.id,
        clockIn,
        entryDate,
        source: 'offline_sync',
      },
    })

    if (entry.projectId) {
      await prisma.timeAllocation.create({
        data: {
          clockEntryId,
          projectId: entry.projectId,
          minutes: 0,
        },
      })
    }
  }

  if (entry.type === 'clock_out' && entry.entryId) {
    const clockEntry = await prisma.clockEntry.findFirst({
      where: { id: entry.entryId, userId: user.id },
    })

    if (!clockEntry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    const clockOut = new Date(entry.timestamp)
    const totalMinutes = calcDurationMinutes(clockEntry.clockIn, clockOut)
    const hash = await generateEntryHash({
      clockIn: clockEntry.clockIn.toISOString(),
      clockOut: clockOut.toISOString(),
      userId: user.id,
      entryDate: clockEntry.entryDate.toISOString(),
    })

    await prisma.$transaction([
      prisma.clockEntry.update({
        where: { id: entry.entryId },
        data: { clockOut, totalMinutes, hash, source: 'offline_sync' },
      }),
      prisma.timeAllocation.updateMany({
        where: { clockEntryId: entry.entryId },
        data: { minutes: totalMinutes },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'offline_sync',
          entityId: entry.entryId,
          newData: { clockOut: clockOut.toISOString(), totalMinutes, source: 'offline_sync' },
        },
      }),
    ])
  }

  return NextResponse.json({ ok: true })
}
