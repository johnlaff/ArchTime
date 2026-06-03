import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateEntryHash } from '@/lib/hash'
import { calcDurationMinutes, getLocalDateBRT, toDateOnlyUTC } from '@/lib/dates'
import { recalculateHourBankForInterval } from '@/lib/hour-bank'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { validateMutationOrigin } from '@/lib/server/security'
import {
  parseIsoTimestamp,
  safeJsonObject,
  validateClosedRange,
} from '@/lib/server/validation'
import { parseActivityType } from '@/lib/activity-types'
import type { PendingEntry } from '@/types'

function permanentError(message: string, status: number) {
  return NextResponse.json({ ok: false, permanent: true, error: message }, { status })
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: string }).code === 'P2002'
}

export async function POST(req: NextRequest) {
  const originError = validateMutationOrigin(req)
  if (originError) return originError

  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let entry: PendingEntry
  try {
    entry = safeJsonObject(await req.json()) as unknown as PendingEntry
  } catch {
    return permanentError('Payload inválido', 400)
  }

  if (entry.type !== 'clock_in' && entry.type !== 'clock_out') {
    return permanentError('Tipo de entrada offline inválido', 400)
  }

  const timestamp = parseIsoTimestamp(entry.timestamp)
  if (!timestamp) return permanentError('Timestamp inválido', 400)
  if (timestamp.getTime() > Date.now() + 5 * 60 * 1000) {
    return permanentError('Timestamp não pode estar no futuro', 400)
  }

  if (entry.type === 'clock_in') {
    const clockIn = timestamp
    const entryDate = toDateOnlyUTC(getLocalDateBRT(clockIn))
    const clockEntryId = entry.entryId ?? entry.id

    const duplicate = await prisma.clockEntry.findUnique({
      where: { id: clockEntryId },
      select: { id: true, userId: true },
    })
    if (duplicate?.userId === user.id) {
      return NextResponse.json({ ok: true, idempotent: true })
    }
    if (duplicate) return permanentError('Entrada offline duplicada inválida', 409)

    if (entry.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: entry.projectId, userId: user.id, isActive: true },
        select: { id: true },
      })
      if (!project) return permanentError('Projeto inválido', 404)
    }

    const activityType = parseActivityType(entry.activityType)
    if (activityType === undefined) return permanentError('Atividade inválida', 400)

    try {
      await prisma.$transaction(async (tx) => {
        const existingOpen = await tx.clockEntry.findFirst({
          where: { userId: user.id, clockOut: null, deletedAt: null },
          select: { id: true },
        })
        if (existingOpen) {
          throw Object.assign(new Error('open-session'), { entryId: existingOpen.id })
        }

        await tx.clockEntry.create({
          data: {
            id: clockEntryId,
            userId: user.id,
            clockIn,
            entryDate,
            activityType,
            source: 'offline_sync',
          },
        })

        if (entry.projectId) {
          await tx.timeAllocation.create({
            data: {
              clockEntryId,
              projectId: entry.projectId,
              minutes: 0,
            },
          })
        }

        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'offline_clock_in',
            entityId: clockEntryId,
            newData: {
              id: clockEntryId,
              clockIn: clockIn.toISOString(),
              entryDate: getLocalDateBRT(clockIn),
              projectId: entry.projectId ?? null,
              activityType,
              source: 'offline_sync',
            },
            userAgent: req.headers.get('user-agent'),
          },
        })
      })
    } catch (error) {
      const maybeError = error as { message?: string; code?: string; entryId?: string }
      if (maybeError.message === 'open-session') {
        return permanentError('Já existe uma entrada em aberto', 409)
      }
      if (isUniqueConstraintError(error)) {
        const [duplicateAfterConflict, existingOpen] = await Promise.all([
          prisma.clockEntry.findUnique({
            where: { id: clockEntryId },
            select: { id: true, userId: true },
          }),
          prisma.clockEntry.findFirst({
            where: { userId: user.id, clockOut: null, deletedAt: null },
            select: { id: true },
          }),
        ])

        if (duplicateAfterConflict?.userId === user.id) {
          return NextResponse.json({ ok: true, idempotent: true })
        }
        if (duplicateAfterConflict) {
          return permanentError('Entrada offline duplicada inválida', 409)
        }
        if (existingOpen) {
          return permanentError('Já existe uma entrada em aberto', 409)
        }
      }
      throw error
    }
  }

  if (entry.type === 'clock_out') {
    if (!entry.entryId) return permanentError('entryId é obrigatório para clock_out', 400)

    const clockEntry = await prisma.clockEntry.findFirst({
      where: { id: entry.entryId, userId: user.id, deletedAt: null },
      include: { allocations: { take: 1 } },
    })

    if (!clockEntry) {
      return permanentError('Entrada não encontrada', 404)
    }

    const clockOut = timestamp

    if (clockEntry.clockOut) {
      return NextResponse.json({ ok: true, idempotent: true })
    }

    const rangeError = validateClosedRange(clockEntry.clockIn, clockOut)
    if (rangeError) return permanentError(rangeError, 400)

    const totalMinutes = calcDurationMinutes(clockEntry.clockIn, clockOut)
    const hash = await generateEntryHash({
      clockIn: clockEntry.clockIn.toISOString(),
      clockOut: clockOut.toISOString(),
      userId: user.id,
      entryDate: clockEntry.entryDate.toISOString().slice(0, 10),
    })

    await prisma.$transaction([
      prisma.clockEntry.update({
        where: { id: entry.entryId },
        data: {
          clockOut,
          totalMinutes,
          hash,
          source: 'offline_sync',
        },
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
          oldData: {
            id: clockEntry.id,
            clockIn: clockEntry.clockIn.toISOString(),
            clockOut: null,
            entryDate: clockEntry.entryDate.toISOString().slice(0, 10),
            totalMinutes: clockEntry.totalMinutes,
            projectId: clockEntry.allocations[0]?.projectId ?? null,
            source: clockEntry.source,
          },
          newData: {
            id: clockEntry.id,
            clockIn: clockEntry.clockIn.toISOString(),
            clockOut: clockOut.toISOString(),
            entryDate: clockEntry.entryDate.toISOString().slice(0, 10),
            totalMinutes,
            projectId: clockEntry.allocations[0]?.projectId ?? null,
            hash,
            source: 'offline_sync',
          },
          userAgent: req.headers.get('user-agent'),
        },
      }),
    ])

    await recalculateHourBankForInterval(user.id, clockEntry.clockIn, clockOut)
  }

  return NextResponse.json({ ok: true })
}
