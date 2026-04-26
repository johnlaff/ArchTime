import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { getOrCreateUserSettings, settingsOptions } from '@/lib/user-settings'
import { ConfiguracoesClient } from './configuracoes-client'

async function ConfiguracoesContent() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const settings = await getOrCreateUserSettings(user.id)
  return <ConfiguracoesClient initialSettings={settings} options={settingsOptions} />
}

function ConfiguracoesFallback() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="h-56 rounded-xl bg-muted" />
      <div className="h-40 rounded-xl bg-muted" />
      <div className="h-48 rounded-xl bg-muted" />
    </div>
  )
}

export default function ConfiguracoesPage() {
  return (
    <Suspense fallback={<ConfiguracoesFallback />}>
      <ConfiguracoesContent />
    </Suspense>
  )
}
