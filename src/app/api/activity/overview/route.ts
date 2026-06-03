import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { getOrCreateUserSettings } from '@/lib/user-settings'
import { fetchHeatmapDays, fetchWeekMinutes } from '@/lib/server/activity-data'
import { fetchActiveProjects, fetchWeekComparison } from '@/lib/server/sidebar-data'
import type { ActivityOverview, WeekBar } from '@/types'
import type { WeekdayKey } from '@/lib/preferences'

const HEATMAP_WEEKS = 13
const DAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

// One round-trip for every dashboard insight: heatmap + weekly bars + week-over-week
// trend + project distribution. The heavy aggregations are `'use cache'` tagged with
// `sidebar-${userId}`, so clock in/out (which revalidates that tag) busts them.
export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getOrCreateUserSettings(user.id)
  const weekStartDay = settings.weekStartDay === 'sunday' ? 0 : 1

  const [heatmap, weekMinutes, trend, distribution] = await Promise.all([
    fetchHeatmapDays(user.id, HEATMAP_WEEKS),
    fetchWeekMinutes(user.id, weekStartDay),
    fetchWeekComparison(user.id, weekStartDay),
    fetchActiveProjects(user.id),
  ])

  const week: WeekBar[] = weekMinutes.map((day) => ({
    date: day.date,
    weekday: day.weekday,
    dayLabel: DAY_LABELS[day.weekday],
    totalMinutes: day.totalMinutes,
    goalMinutes: settings.workMinutesByWeekday[String(day.weekday) as WeekdayKey] ?? 0,
  }))

  const overview: ActivityOverview = {
    heatmap,
    week,
    trend,
    distribution: distribution.map((project) => ({
      id: project.id,
      name: project.name,
      color: project.color,
      monthMinutes: project.monthMinutes,
    })),
  }

  return NextResponse.json(overview, {
    headers: {
      'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
      Vary: 'Cookie',
    },
  })
}
