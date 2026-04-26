import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { ProjetosClient } from './projetos-client'
import ProjetosLoading from './loading'
import type { ProjectOption } from '@/types'

async function ProjetosContent() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

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

  return <ProjetosClient initialProjects={initialProjects} />
}

export default function ProjetosPage() {
  return (
    <Suspense fallback={<ProjetosLoading />}>
      <ProjetosContent />
    </Suspense>
  )
}
