import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { HistoricoClient } from './historico-client'

export default async function HistoricoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <HistoricoClient />
}
