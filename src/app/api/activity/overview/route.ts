import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { getOrCreateUserSettings } from '@/lib/user-settings'
import { fetchHeatmapDays, fetchWeekMinutes } from '@/lib/server/activity-data'
import { fetchActiveProjects, fetchWeekComparison } from '@/lib/server/sidebar-data'
import { applyHeatmapLevels, applyWeekLevels } from '@/lib/heatmap'
import type { ActivityOverview, WeekBar } from '@/types'

const DAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

// One round-trip for every dashboard insight: heatmap + weekly bars + week-over-week
// trend + project distribution. The heavy aggregations are `'use cache'` tagged with
// `sidebar-${userId}`, so clock in/out (which revalidates that tag) busts them.
export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getOrCreateUserSettings(user.id)
  const weekStartDay = settings.weekStartDay === 'sunday' ? 0 : 1

  const [rawHeatmap, weekMinutes, trend, distribution] = await Promise.all([
    fetchHeatmapDays(user.id),
    fetchWeekMinutes(user.id, weekStartDay),
    fetchWeekComparison(user.id, weekStartDay),
    fetchActiveProjects(user.id),
  ])

  // Meta/nível são aplicados aqui (não no cache por userId) para que mudar a jornada
  // recolore o histórico na hora, sem esperar revalidação do cache.
  const heatmap = applyHeatmapLevels(rawHeatmap, settings.workMinutesByWeekday)

  // Mesma escala do heatmap para as barras semanais: meta com feriado aplicado + nível
  // relativo (ou fallback absoluto quando não há jornada prevista) — via applyWeekLevels.
  const week: WeekBar[] = applyWeekLevels(weekMinutes, settings.workMinutesByWeekday).map((day) => ({
    date: day.date,
    weekday: day.weekday,
    dayLabel: DAY_LABELS[day.weekday],
    totalMinutes: day.totalMinutes,
    goalMinutes: day.goalMinutes,
    level: day.level,
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
