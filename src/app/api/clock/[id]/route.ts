import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import {
  calcDurationMinutes,
  formatBRT,
  getLocalDateBRT,
  parseBRTDateTimeLocal,
  toDateOnlyUTC,
} from '@/lib/dates'
import { generateEntryHash } from '@/lib/hash'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { validateMutationOrigin } from '@/lib/server/security'
import {
  parseClockDateTime,
  safeJsonObject,
  validateClosedRange,
} from '@/lib/server/validation'
import { recalculateHourBankForInterval } from '@/lib/hour-bank'

type EntryWithAllocations = Awaited<ReturnType<typeof getEntry>>

async function readOptionalJson(req: NextRequest): Promise<Record<string, unknown>> {
  const raw = await req.text()
  if (!raw.trim()) return {}
  return safeJsonObject(JSON.parse(raw))
}

async function getEntry(id: string, userId: string) {
  return prisma.clockEntry.findFirst({
    where: { id, userId, deletedAt: null },
    include: {
      allocations: {
        include: { project: { select: { id: true, name: true, color: true } } },
        take: 1,
      },
    },
  })
}

function serializeOldData(entry: NonNullable<EntryWithAllocations>) {
  return {
    id: entry.id,
    clockIn: entry.clockIn.toISOString(),
    clockOut: entry.clockOut?.toISOString() ?? null,
    entryDate: entry.entryDate.toISOString().slice(0, 10),
    totalMinutes: entry.totalMinutes,
    projectId: entry.allocations[0]?.projectId ?? null,
    projectName: entry.allocations[0]?.project.name ?? null,
    hash: entry.hash,
    source: entry.source,
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = validateMutationOrigin(req)
  if (originError) return originError

  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const entry = await getEntry(id, user.id)
  if (!entry) {
    return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
  }

  if (entry.clockOut) {
    return NextResponse.json({
      id: entry.id,
      clockIn: entry.clockIn.toISOString(),
      clockOut: entry.clockOut.toISOString(),
      totalMinutes: entry.totalMinutes,
      source: entry.source,
      projectId: entry.allocations[0]?.projectId ?? null,
      projectName: entry.allocations[0]?.project.name ?? null,
      projectColor: entry.allocations[0]?.project.color ?? null,
    })
  }

  let body: Record<string, unknown>
  try {
    body = await readOptionalJson(req)
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const clockOut = body.clockOutAt ? parseClockDateTime(body.clockOutAt) : new Date()
  if (!clockOut) {
    return NextResponse.json({ error: 'Horário de saída inválido' }, { status: 400 })
  }

  const rangeError = validateClosedRange(entry.clockIn, clockOut)
  if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 })

  const totalMinutes = calcDurationMinutes(entry.clockIn, clockOut)
  const hash = await generateEntryHash({
    clockIn: entry.clockIn.toISOString(),
    clockOut: clockOut.toISOString(),
    userId: user.id,
    entryDate: entry.entryDate.toISOString().slice(0, 10),
  })
  const oldData = serializeOldData(entry)

  const updated = await prisma.$transaction(async (tx) => {
    const updatedEntry = await tx.clockEntry.update({
      where: { id },
      data: { clockOut, totalMinutes, hash },
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
        oldData,
        newData: {
          ...oldData,
          clockOut: clockOut.toISOString(),
          totalMinutes,
          hash,
        },
        userAgent: req.headers.get('user-agent'),
      },
    })

    return updatedEntry
  })

  await recalculateHourBankForInterval(user.id, entry.clockIn, clockOut)

  revalidateTag(`sidebar-${user.id}`, { expire: 0 })
  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = validateMutationOrigin(req)
  if (originError) return originError

  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const entry = await getEntry(id, user.id)

  if (!entry) {
    return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
  }

  if (!entry.clockOut) {
    return NextResponse.json(
      { error: 'Não é possível apagar uma sessão em andamento' },
      { status: 409 }
    )
  }

  const deletedAt = new Date()
  const oldData = serializeOldData(entry)

  await prisma.$transaction(async (tx) => {
    await tx.clockEntry.update({
      where: { id },
      data: { deletedAt, deletedBy: user.id },
    })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'delete_entry',
        entityId: id,
        oldData,
        newData: { ...oldData, deletedAt: deletedAt.toISOString(), deletedBy: user.id },
        userAgent: req.headers.get('user-agent'),
      },
    })
  })

  await recalculateHourBankForInterval(user.id, entry.clockIn, entry.clockOut)

  revalidateTag(`sidebar-${user.id}`, { expire: 0 })
  return new NextResponse(null, { status: 204 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = validateMutationOrigin(req)
  if (originError) return originError

  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = safeJsonObject(await req.json())
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  const {
    clockInAt,
    clockOutAt,
    clockInTime,
    clockOutTime,
    projectId: rawProjectId,
  } = body as {
    clockInAt?: string
    clockOutAt?: string
    clockInTime?: string
    clockOutTime?: string
    projectId?: string | null
  }

  if ((!clockInAt || !clockOutAt) && (!clockInTime || !clockOutTime)) {
    return NextResponse.json({ error: 'Horários são obrigatórios' }, { status: 400 })
  }

  const entry = await getEntry(id, user.id)

  if (!entry) {
    return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
  }

  if (!entry.clockOut) {
    return NextResponse.json(
      { error: 'Não é possível editar uma sessão em andamento' },
      { status: 409 }
    )
  }

  const newClockIn = clockInAt
    ? parseBRTDateTimeLocal(clockInAt)
    : parseBRTDateTimeLocal(`${formatBRT(entry.clockIn, 'yyyy-MM-dd')}T${clockInTime}`)
  const newClockOut = clockOutAt
    ? parseBRTDateTimeLocal(clockOutAt)
    : parseBRTDateTimeLocal(`${formatBRT(entry.clockOut, 'yyyy-MM-dd')}T${clockOutTime}`)

  if (!newClockIn || !newClockOut) {
    return NextResponse.json({ error: 'Formato de data/hora inválido' }, { status: 400 })
  }

  const rangeError = validateClosedRange(newClockIn, newClockOut)
  if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 })

  const projectId = typeof rawProjectId === 'string' && rawProjectId.length > 0
    ? rawProjectId
    : null

  let project: { id: string; name: string; color: string } | null = null
  if (projectId) {
    project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true, name: true, color: true },
    })
    if (!project) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 404 })
    }
  }

  const totalMinutes = calcDurationMinutes(newClockIn, newClockOut)
  const entryDate = toDateOnlyUTC(getLocalDateBRT(newClockIn))
  const hash = await generateEntryHash({
    clockIn: newClockIn.toISOString(),
    clockOut: newClockOut.toISOString(),
    userId: user.id,
    entryDate: entryDate.toISOString().slice(0, 10),
  })

  const oldData = serializeOldData(entry)

  const updated = await prisma.$transaction(async (tx) => {
    const updatedEntry = await tx.clockEntry.update({
      where: { id },
      data: {
        clockIn: newClockIn,
        clockOut: newClockOut,
        entryDate,
        totalMinutes,
        hash,
        source: 'edited',
      },
    })

    await tx.timeAllocation.deleteMany({ where: { clockEntryId: id } })
    if (projectId) {
      await tx.timeAllocation.create({
        data: { clockEntryId: id, projectId, minutes: totalMinutes },
      })
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
          entryDate: getLocalDateBRT(newClockIn),
          totalMinutes,
          projectId: projectId ?? null,
          projectName: project?.name ?? null,
          hash,
          source: 'edited',
        },
        userAgent: req.headers.get('user-agent'),
      },
    })

    return updatedEntry
  })

  await Promise.all([
    recalculateHourBankForInterval(user.id, entry.clockIn, entry.clockOut),
    recalculateHourBankForInterval(user.id, newClockIn, newClockOut),
  ])

  revalidateTag(`sidebar-${user.id}`, { expire: 0 })
  return NextResponse.json({
    id: updated.id,
    clockIn: updated.clockIn.toISOString(),
    clockOut: updated.clockOut!.toISOString(),
    totalMinutes: updated.totalMinutes,
    source: updated.source,
    entryDate: getLocalDateBRT(updated.clockIn),
    projectId: projectId ?? null,
    projectName: project?.name ?? null,
    projectColor: project?.color ?? null,
  })
}
