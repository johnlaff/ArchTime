import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { ProjetosClient } from './projetos-client'
import type { ProjectOption } from '@/types'

export default async function ProjetosPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const startedAt = Date.now()
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })

  const initialProjects: ProjectOption[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    color: project.color,
    hourlyRate: project.hourlyRate == null ? null : Number(project.hourlyRate),
    isActive: project.isActive,
  }))

  console.info('page.projects.duration', { ms: Date.now() - startedAt })
  return <ProjetosClient initialProjects={initialProjects} />
}
