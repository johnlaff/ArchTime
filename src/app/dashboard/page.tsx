import { redirect } from 'next/navigation'
import { cacheLife } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { DashboardClient } from './dashboard-client'
import type { ActiveSession, ProjectOption } from '@/types'

async function getCachedProjects(userId: string) {
  'use cache'
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  return prisma.project.findMany({
    where: { userId, isActive: true },
    orderBy: { name: 'asc' },
  })
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [activeEntry, projects] = await Promise.all([
    prisma.clockEntry.findFirst({
      where: { userId: user.id, clockOut: null },
      include: {
        allocations: {
          include: { project: { select: { name: true, color: true } } },
          take: 1,
        },
      },
    }),
    getCachedProjects(user.id),
  ])

  const session: ActiveSession | null = activeEntry
    ? {
        id: activeEntry.id,
        clockIn: activeEntry.clockIn.toISOString(),
        projectId: activeEntry.allocations[0]?.projectId ?? null,
        projectName: activeEntry.allocations[0]?.project.name ?? null,
        projectColor: activeEntry.allocations[0]?.project.color ?? null,
      }
    : null

  const projectOptions: ProjectOption[] = projects.map(p => ({
    id: p.id,
    name: p.name,
    clientName: p.clientName,
    color: p.color,
    hourlyRate: p.hourlyRate ? Number(p.hourlyRate) : null,
    isActive: p.isActive,
  }))

  return (
    <DashboardClient
      initialSession={session}
      projects={projectOptions}
    />
  )
}
