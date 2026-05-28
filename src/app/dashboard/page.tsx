import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getCachedAuthenticatedUser } from '@/lib/server/auth'
import { buildDailySummary } from '@/lib/summary'
import { DashboardClient } from './dashboard-client'
import DashboardLoading from './loading'
import { PageShell } from '@/components/page-shell'
import type { ActiveSession, ProjectOption } from '@/types'

async function getCachedProjects(userId: string) {
  'use cache'
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  cacheTag(`projects-${userId}`)
  return prisma.project.findMany({
    where: { userId, isActive: true },
    orderBy: { name: 'asc' },
  })
}

async function DashboardContent() {
  const user = await getCachedAuthenticatedUser()
  if (!user) redirect('/login')

  const [activeEntry, projects, summary] = await Promise.all([
    prisma.clockEntry.findFirst({
      where: { userId: user.id, clockOut: null, deletedAt: null },
      include: {
        allocations: {
          include: { project: { select: { name: true, color: true } } },
          take: 1,
        },
      },
    }),
    getCachedProjects(user.id),
    buildDailySummary(user.id),
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
      initialSummary={summary}
    />
  )
}

export default function DashboardPage() {
  return (
    <PageShell>
      <Suspense fallback={<DashboardLoading />}>
        <DashboardContent />
      </Suspense>
    </PageShell>
  )
}
