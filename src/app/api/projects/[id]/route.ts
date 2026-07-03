import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { validateMutationOrigin } from '@/lib/server/security'
import { serializeProject } from '@/lib/server/serialize-project'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = validateMutationOrigin(req)
  if (originError) return originError

  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
  })

  if (!project) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const allocationCount = await prisma.timeAllocation.count({
    where: {
      projectId: id,
      clockEntry: {
        deletedAt: null,
      },
    },
  })

  if (allocationCount > 0) {
    const archived = await prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id },
        data: { isActive: false },
      })
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'archive_project_with_entries',
          entityId: id,
          oldData: { ...serializeProject(project), allocationCount },
          newData: { ...serializeProject(updated), allocationCount },
          userAgent: req.headers.get('user-agent'),
        },
      })
      return updated
    })

    revalidateTag(`projects-${user.id}`, { expire: 0 })
    return NextResponse.json({
      ...serializeProject(archived),
      archivedInsteadOfDeleted: true,
      message: 'Projeto arquivado porque possui registros de horas.',
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'delete_project',
        entityId: id,
        oldData: { ...serializeProject(project) },
        newData: { deletedAt: new Date().toISOString(), projectName: project.name },
        userAgent: req.headers.get('user-agent'),
      },
    })
  })

  revalidateTag(`projects-${user.id}`, { expire: 0 })
  return new NextResponse(null, { status: 204 })
}
