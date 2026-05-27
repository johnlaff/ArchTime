import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getCachedAuthenticatedUser } from '@/lib/server/auth'

export interface ActiveProject {
  id: string
  name: string
  color: string
  monthMinutes: number
}

export interface WeekComparison {
  thisWeekMinutes: number
  lastWeekMinutes: number
  deltaMinutes: number
  deltaPercent: number | null
}

export const getCachedUser = getCachedAuthenticatedUser

type RawActiveProject = { id: string; name: string; color: string; month_minutes: number }

export async function fetchActiveProjects(userId: string): Promise<ActiveProject[]> {
  'use cache'
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  cacheTag(`sidebar-${userId}`)

  const rows = await prisma.$queryRaw<RawActiveProject[]>`
    SELECT
      p.id,
      p.name,
      p.color,
      COALESCE(SUM(CASE WHEN ce.id IS NOT NULL THEN ta.minutes ELSE 0 END), 0)::int AS month_minutes
    FROM projects p
    LEFT JOIN time_allocations ta ON ta.project_id = p.id
    LEFT JOIN clock_entries ce
      ON ce.id = ta.clock_entry_id
      AND ce.user_id = ${userId}
      AND ce.deleted_at IS NULL
      AND ce.entry_date >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
      AND ce.entry_date <  date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 month')
    WHERE p.user_id = ${userId} AND p.is_active = true
    GROUP BY p.id, p.name, p.color
    ORDER BY month_minutes DESC, p.name
    LIMIT 4
  `
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    monthMinutes: Number(r.month_minutes),
  }))
}

type RawWeekRow = { this_week_minutes: number; last_week_minutes: number; delta_minutes: number }

export async function fetchWeekComparison(
  userId: string,
  weekStartDay: 0 | 1 = 1
): Promise<WeekComparison> {
  'use cache'
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  cacheTag(`sidebar-${userId}`)

  // Postgres date_trunc('week') is Monday-based. For a Sunday start, shift one
  // day forward before truncating and back after, so the boundary lands on Sunday.
  const offset = weekStartDay === 0 ? 1 : 0

  const rows = await prisma.$queryRaw<RawWeekRow[]>`
    WITH bounds AS (
      SELECT date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo') + make_interval(days => ${offset}::int))
             - make_interval(days => ${offset}::int) AS week_start
    ),
    this_week AS (
      SELECT COALESCE(SUM(ta.minutes), 0) AS minutes
      FROM time_allocations ta
      JOIN clock_entries ce ON ce.id = ta.clock_entry_id
      CROSS JOIN bounds
      WHERE ce.user_id = ${userId}
        AND ce.deleted_at IS NULL
        AND ce.entry_date >= bounds.week_start
        AND ce.entry_date <  bounds.week_start + INTERVAL '7 days'
    ),
    last_week AS (
      SELECT COALESCE(SUM(ta.minutes), 0) AS minutes
      FROM time_allocations ta
      JOIN clock_entries ce ON ce.id = ta.clock_entry_id
      CROSS JOIN bounds
      WHERE ce.user_id = ${userId}
        AND ce.deleted_at IS NULL
        AND ce.entry_date >= bounds.week_start - INTERVAL '7 days'
        AND ce.entry_date <  bounds.week_start
    )
    SELECT
      this_week.minutes::int AS this_week_minutes,
      last_week.minutes::int AS last_week_minutes,
      (this_week.minutes - last_week.minutes)::int AS delta_minutes
    FROM this_week, last_week
  `
  const row = rows[0]
  if (!row) return { thisWeekMinutes: 0, lastWeekMinutes: 0, deltaMinutes: 0, deltaPercent: null }

  const lw = Number(row.last_week_minutes)
  return {
    thisWeekMinutes: Number(row.this_week_minutes),
    lastWeekMinutes: lw,
    deltaMinutes: Number(row.delta_minutes),
    deltaPercent: lw > 0 ? Math.round((Number(row.delta_minutes) / lw) * 100) : null,
  }
}
