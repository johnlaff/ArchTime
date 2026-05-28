import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCachedAuthenticatedUser } from '@/lib/server/auth'
import { getOrCreateUserSettings, settingsOptions } from '@/lib/user-settings'
import { ConfiguracoesClient } from './configuracoes-client'
import ConfiguracoesLoading from './loading'
import { PageShell } from '@/components/page-shell'

async function ConfiguracoesContent() {
  const user = await getCachedAuthenticatedUser()
  if (!user) redirect('/login')

  const settings = await getOrCreateUserSettings(user.id)
  return <ConfiguracoesClient initialSettings={settings} options={settingsOptions} />
}

export default function ConfiguracoesPage() {
  return (
    <PageShell>
      <Suspense fallback={<ConfiguracoesLoading />}>
        <ConfiguracoesContent />
      </Suspense>
    </PageShell>
  )
}
