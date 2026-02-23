import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'
import { calcDurationMinutes } from '@/lib/dates'
import { generateEntryHash } from '@/lib/hash'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const entry = await prisma.clockEntry.findFirst({
    where: { id, userId: user.id, clockOut: null },
  })
  if (!entry) {
    return NextResponse.json(
      { error: 'Entrada não encontrada ou já fechada' },
      { status: 404 }
    )
  }

  const now = new Date()
  const totalMinutes = calcDurationMinutes(entry.clockIn, now)
  const hash = await generateEntryHash({
    clockIn: entry.clockIn.toISOString(),
    clockOut: now.toISOString(),
    userId: user.id,
    entryDate: entry.entryDate.toISOString(),
  })

  const updated = await prisma.$transaction(async (tx) => {
    const updatedEntry = await tx.clockEntry.update({
      where: { id },
      data: { clockOut: now, totalMinutes, hash },
    })

    await tx.timeAllocation.updateMany({
      where: { clockEntryId: id },
      data: { minutes: totalMinutes },
    })

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'clock_out',
        entityId: id,
        newData: { clockOut: now.toISOString(), totalMinutes, hash },
        userAgent: req.headers.get('user-agent'),
      },
    })

    return updatedEntry
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const entry = await prisma.clockEntry.findFirst({
    where: { id, userId: user.id },
  })

  if (!entry) {
    return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
  }

  if (!entry.clockOut) {
    return NextResponse.json(
      { error: 'Não é possível apagar uma sessão em andamento' },
      { status: 409 }
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.timeAllocation.deleteMany({ where: { clockEntryId: id } })
    await tx.clockEntry.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'delete_entry',
        entityId: id,
        newData: { deletedAt: new Date().toISOString() },
        userAgent: req.headers.get('user-agent'),
      },
    })
  })

  return new NextResponse(null, { status: 204 })
}
