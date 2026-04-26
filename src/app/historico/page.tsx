import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { HistoricoClient } from './historico-client'

export default async function HistoricoPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  return <HistoricoClient />
}
