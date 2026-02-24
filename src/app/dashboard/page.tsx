import { redirect } from 'next/navigation'
import { cacheLife } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getLocalDate } from '@/lib/dates'
import { DashboardClient } from './dashboard-client'
import type { ActiveSession, DailySummary, ProjectOption } from '@/types'

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

  const today = new Date(getLocalDate() + 'T00:00:00.000Z')

  const [activeEntry, todayEntries, projects] = await Promise.all([
    prisma.clockEntry.findFirst({
      where: { userId: user.id, clockOut: null },
      include: {
        allocations: {
          include: { project: { select: { name: true, color: true } } },
          take: 1,
        },
      },
    }),
    prisma.clockEntry.findMany({
      where: { userId: user.id, entryDate: today, clockOut: { not: null } },
      include: {
        allocations: {
          include: { project: { select: { name: true, color: true } } },
          take: 1,
        },
      },
      orderBy: { clockIn: 'desc' },
      take: 5,
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

  const summary: DailySummary = {
    totalMinutes: todayEntries.reduce((s, e) => s + (e.totalMinutes ?? 0), 0),
    sessionCount: todayEntries.length,
    entries: todayEntries.map(e => ({
      id: e.id,
      clockIn: e.clockIn.toISOString(),
      clockOut: e.clockOut?.toISOString() ?? null,
      totalMinutes: e.totalMinutes,
      projectName: e.allocations[0]?.project.name ?? null,
      projectColor: e.allocations[0]?.project.color ?? null,
    })),
  }

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
      initialSummary={summary}
      projects={projectOptions}
    />
  )
}
