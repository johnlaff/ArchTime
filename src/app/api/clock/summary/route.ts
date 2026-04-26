import { NextResponse } from 'next/server'
import { buildDailySummary } from '@/lib/summary'
import { getAuthenticatedUser } from '@/lib/server/auth'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const summary = await buildDailySummary(user.id)
  return NextResponse.json(summary)
}
