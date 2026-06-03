import { NextRequest, NextResponse } from 'next/server'
import { buildHistoryBundle } from '@/lib/history'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { parseDateOnly, parseMonth, parsePage } from '@/lib/server/validation'
import { isActivityType } from '@/lib/activity-types'
import type { HistoryFilters } from '@/types'

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = parseMonth(searchParams.get('month'))
  if (!month) {
    return NextResponse.json({ error: 'Mês inválido. Use YYYY-MM.' }, { status: 400 })
  }

  const page = parsePage(searchParams.get('page'), 1, 10000)
  const pageSize = parsePage(searchParams.get('pageSize'), 50, 200)

  const rawActivity = searchParams.get('activityType')
  const filters: HistoryFilters = {
    q: searchParams.get('q')?.trim().slice(0, 100) || undefined,
    projectId: searchParams.get('projectId') || undefined,
    activityType: isActivityType(rawActivity) ? rawActivity : undefined,
    dateStart: parseDateOnly(searchParams.get('dateStart')) || undefined,
    dateEnd: parseDateOnly(searchParams.get('dateEnd')) || undefined,
  }

  const bundle = await buildHistoryBundle(user.id, month, page, pageSize, filters)
  return NextResponse.json(bundle, {
    headers: {
      'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
      'Vary': 'Cookie',
    },
  })
}
