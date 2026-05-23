import { NextRequest, NextResponse } from 'next/server'
import { buildHistoryBundle } from '@/lib/history'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { parseMonth, parsePage } from '@/lib/server/validation'

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
  const bundle = await buildHistoryBundle(user.id, month, page, pageSize)
  return NextResponse.json(bundle, {
    headers: {
      'Cache-Control': 'private, s-maxage=60, stale-while-revalidate=300',
      'Vary': 'Cookie',
    },
  })
}
