import { NextRequest, NextResponse } from 'next/server'
import { buildHourBankMonth } from '@/lib/hour-bank'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { parseMonth } from '@/lib/server/validation'

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = parseMonth(searchParams.get('month'))
  if (!month) {
    return NextResponse.json({ error: 'Mês inválido. Use YYYY-MM.' }, { status: 400 })
  }

  const data = await buildHourBankMonth(user.id, month, { persist: false })
  return NextResponse.json(data)
}
