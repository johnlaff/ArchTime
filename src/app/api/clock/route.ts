import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getLocalDateBRT, toDateOnlyUTC } from '@/lib/dates'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { validateMutationOrigin } from '@/lib/server/security'
import { safeJsonObject } from '@/lib/server/validation'

export async function POST(req: NextRequest) {
  const originError = validateMutationOrigin(req)
  if (originError) return originError

  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = safeJsonObject(await req.json())
  } catch {
    body = {}
  }

  const projectId = typeof body.projectId === 'string' && body.projectId.length > 0
    ? body.projectId
    : null

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id, isActive: true },
      select: { id: true },
    })
    if (!project) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 404 })
    }
  }

  const now = new Date()
  const entryDate = toDateOnlyUTC(getLocalDateBRT(now))

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const existing = await tx.clockEntry.findFirst({
        where: { userId: user.id, clockOut: null, deletedAt: null },
        select: { id: true },
      })
      if (existing) {
        throw Object.assign(new Error('open-session'), { entryId: existing.id })
      }

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
          newData: {
            id: clockEntry.id,
            clockIn: now.toISOString(),
            entryDate: getLocalDateBRT(now),
            projectId,
            source: 'web',
          },
          userAgent: req.headers.get('user-agent'),
        },
      })

      return clockEntry
    })

    revalidateTag(`sidebar-${user.id}`, { expire: 0 })
    revalidateTag(`history-${user.id}`, { expire: 0 })
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    const maybeError = error as { message?: string; entryId?: string; code?: string }
    if (maybeError.message === 'open-session') {
      return NextResponse.json(
        { error: 'Já existe uma entrada em aberto', entryId: maybeError.entryId },
        { status: 409 }
      )
    }
    if (maybeError.code === 'P2002') {
      const existing = await prisma.clockEntry.findFirst({
        where: { userId: user.id, clockOut: null, deletedAt: null },
        select: { id: true },
      })
      return NextResponse.json(
        { error: 'Já existe uma entrada em aberto', entryId: existing?.id },
        { status: 409 }
      )
    }
    throw error
  }
}
