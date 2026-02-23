import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
  })

  if (!project) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const isAdmin = user.email === process.env.ADMIN_EMAIL

  const allocationCount = await prisma.timeAllocation.count({
    where: { projectId: id },
  })

  if (allocationCount > 0 && !isAdmin) {
    return NextResponse.json(
      { error: 'Este projeto possui registros de horas e não pode ser apagado. Use Arquivar para ocultá-lo.' },
      { status: 409 }
    )
  }

  await prisma.$transaction(async (tx) => {
    // Admin pode apagar projetos com registros — remove alocações antes do projeto
    if (allocationCount > 0) {
      await tx.timeAllocation.deleteMany({ where: { projectId: id } })
    }
    await tx.project.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'delete_project',
        entityId: id,
        newData: { deletedAt: new Date().toISOString(), projectName: project.name },
        userAgent: req.headers.get('user-agent'),
      },
    })
  })

  return new NextResponse(null, { status: 204 })
}
