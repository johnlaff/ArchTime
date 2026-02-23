import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'
import { calcDurationMinutes } from '@/lib/dates'
import { generateEntryHash } from '@/lib/hash'
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'
import { TIMEZONE } from '@/lib/constants'

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { clockInTime, clockOutTime, projectId } = body as {
    clockInTime: string       // "HH:MM" em BRT
    clockOutTime: string      // "HH:MM" em BRT
    projectId: string | null
  }

  if (!clockInTime || !clockOutTime) {
    return NextResponse.json({ error: 'Horários são obrigatórios' }, { status: 400 })
  }

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!TIME_RE.test(clockInTime) || !TIME_RE.test(clockOutTime)) {
    return NextResponse.json({ error: 'Formato de horário inválido (HH:MM)' }, { status: 400 })
  }

  const entry = await prisma.clockEntry.findFirst({
    where: { id, userId: user.id },
    include: { allocations: { take: 1 } },
  })

  if (!entry) {
    return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
  }

  if (!entry.clockOut) {
    return NextResponse.json(
      { error: 'Não é possível editar uma sessão em andamento' },
      { status: 409 }
    )
  }

  // Reconstruir datas UTC a partir do horário BRT + data do registro
  const brtDate = formatInTimeZone(entry.clockIn, TIMEZONE, 'yyyy-MM-dd')
  const newClockIn = fromZonedTime(`${brtDate}T${clockInTime}:00`, TIMEZONE)
  const newClockOut = fromZonedTime(`${brtDate}T${clockOutTime}:00`, TIMEZONE)

  if (newClockOut <= newClockIn) {
    return NextResponse.json(
      { error: 'Horário de saída deve ser posterior ao de entrada' },
      { status: 400 }
    )
  }

  const totalMinutes = calcDurationMinutes(newClockIn, newClockOut)
  const hash = await generateEntryHash({
    clockIn: newClockIn.toISOString(),
    clockOut: newClockOut.toISOString(),
    userId: user.id,
    entryDate: entry.entryDate.toISOString(),
  })

  const oldData = {
    clockIn: entry.clockIn.toISOString(),
    clockOut: entry.clockOut.toISOString(),
    totalMinutes: entry.totalMinutes,
    projectId: entry.allocations[0]?.projectId ?? null,
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedEntry = await tx.clockEntry.update({
      where: { id },
      data: { clockIn: newClockIn, clockOut: newClockOut, totalMinutes, hash, source: 'edited' },
    })

    // Atualizar TimeAllocation
    if (projectId) {
      await tx.timeAllocation.deleteMany({ where: { clockEntryId: id } })
      await tx.timeAllocation.create({
        data: { clockEntryId: id, projectId, minutes: totalMinutes },
      })
    } else {
      await tx.timeAllocation.deleteMany({ where: { clockEntryId: id } })
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'edit_entry',
        entityId: id,
        oldData,
        newData: {
          clockIn: newClockIn.toISOString(),
          clockOut: newClockOut.toISOString(),
          totalMinutes,
          projectId: projectId ?? null,
        },
        userAgent: req.headers.get('user-agent'),
      },
    })

    return updatedEntry
  })

  return NextResponse.json({
    id: updated.id,
    clockIn: updated.clockIn.toISOString(),
    clockOut: updated.clockOut!.toISOString(),
    totalMinutes: updated.totalMinutes,
    source: updated.source,
    projectId: projectId ?? null,
  })
}
