import { redirect } from 'next/navigation'
import { getLocalDateBRT } from '@/lib/dates'
import { buildHistoryBundle } from '@/lib/history'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { HistoricoClient } from './historico-client'

export default async function HistoricoPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const month = getLocalDateBRT().slice(0, 7)
  const initialBundle = await buildHistoryBundle(user.id, month)

  return <HistoricoClient initialMonth={month} initialBundle={initialBundle} />
}
