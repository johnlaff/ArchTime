import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getCachedAuthenticatedUser } from '@/lib/server/auth'
import { ProjetosClient } from './projetos-client'
import ProjetosLoading from './loading'
import { PageShell } from '@/components/page-shell'
import type { ProjectOption } from '@/types'

async function getCachedProjectsForManagement(userId: string) {
  'use cache'
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 })
  cacheTag(`projects-${userId}`)

  return prisma.project.findMany({
    where: { userId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })
}

async function ProjetosContent() {
  const user = await getCachedAuthenticatedUser()
  if (!user) redirect('/login')

  const projects = await getCachedProjectsForManagement(user.id)

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
    <PageShell>
      <Suspense fallback={<ProjetosLoading />}>
        <ProjetosContent />
      </Suspense>
    </PageShell>
  )
}
