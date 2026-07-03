import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { validateMutationOrigin } from '@/lib/server/security'
import { serializeProject } from '@/lib/server/serialize-project'
import {
  normalizeHexColor,
  normalizeHourlyRate,
  safeJsonObject,
} from '@/lib/server/validation'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })

  return NextResponse.json(projects.map(serializeProject))
}

export async function POST(req: NextRequest) {
  const originError = validateMutationOrigin(req)
  if (originError) return originError

  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = safeJsonObject(await req.json())
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  const { name, clientName, hourlyRate, color } = body

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }
  const normalizedRate = normalizeHourlyRate(hourlyRate)
  if (normalizedRate === undefined) {
    return NextResponse.json({ error: 'Valor por hora inválido' }, { status: 400 })
  }
  const normalizedColor = normalizeHexColor(color)
  if (!normalizedColor) {
    return NextResponse.json({ error: 'Cor inválida' }, { status: 400 })
  }

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        userId: user.id,
        name: name.trim(),
        clientName: typeof clientName === 'string' && clientName.trim()
          ? clientName.trim()
          : null,
        hourlyRate: normalizedRate,
        color: normalizedColor,
      },
    })

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'create_project',
        entityId: created.id,
        newData: { ...serializeProject(created) },
        userAgent: req.headers.get('user-agent'),
      },
    })

    return created
  })

  revalidateTag(`projects-${user.id}`, { expire: 0 })
  return NextResponse.json(serializeProject(project), { status: 201 })
}

export async function PUT(req: NextRequest) {
  const originError = validateMutationOrigin(req)
  if (originError) return originError

  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = safeJsonObject(await req.json())
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  const { id, name, clientName, hourlyRate, color, isActive } = body

  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
  })
  if (!project) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const normalizedRate = normalizeHourlyRate(hourlyRate)
  if (normalizedRate === undefined) {
    return NextResponse.json({ error: 'Valor por hora inválido' }, { status: 400 })
  }
  const normalizedColor = color == null ? project.color : normalizeHexColor(color)
  if (!normalizedColor) {
    return NextResponse.json({ error: 'Cor inválida' }, { status: 400 })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.project.update({
      where: { id },
      data: {
        name: typeof name === 'string' && name.trim() ? name.trim() : project.name,
        clientName: typeof clientName === 'string'
          ? clientName.trim() || null
          : project.clientName,
        hourlyRate: hourlyRate === undefined ? project.hourlyRate : normalizedRate,
        color: normalizedColor,
        isActive: typeof isActive === 'boolean' ? isActive : project.isActive,
      },
    })

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'update_project',
        entityId: id,
        oldData: { ...serializeProject(project) },
        newData: { ...serializeProject(next) },
        userAgent: req.headers.get('user-agent'),
      },
    })

    return next
  })

  revalidateTag(`projects-${user.id}`, { expire: 0 })
  return NextResponse.json(serializeProject(updated))
}
