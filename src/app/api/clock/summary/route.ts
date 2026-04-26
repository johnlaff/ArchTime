import { NextResponse } from 'next/server'
import { buildDailySummary } from '@/lib/summary'
import { getAuthenticatedUser } from '@/lib/server/auth'

export async function GET() {
  const startedAt = Date.now()
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const summary = await buildDailySummary(user.id)
  console.info('api.clock.summary.duration', { ms: Date.now() - startedAt })
  return NextResponse.json(summary)
}
