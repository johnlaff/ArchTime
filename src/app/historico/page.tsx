import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { cacheLife, cacheTag } from 'next/cache'
import { getCachedAuthenticatedUser } from '@/lib/server/auth'
import { buildHistoryBundle } from '@/lib/history'
import { getCurrentMonth } from '@/lib/current-month'
import { HistoricoClient } from './historico-client'
import { PageShell } from '@/components/page-shell'
import HistoricoLoading from './loading'

async function HistoricoInitialData({ userId, month }: { userId: string; month: string }) {
  'use cache'
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 })
  cacheTag(`history-${userId}`)

  const bundle = await buildHistoryBundle(userId, month, 1, 50)

  return <HistoricoClient initialBundle={bundle} initialMonth={month} />
}

async function HistoricoContent() {
  const user = await getCachedAuthenticatedUser()
  if (!user) redirect('/login')

  const month = getCurrentMonth()
  return <HistoricoInitialData userId={user.id} month={month} />
}

export default function HistoricoPage() {
  return (
    <PageShell>
      <Suspense fallback={<HistoricoLoading />}>
        <HistoricoContent />
      </Suspense>
    </PageShell>
  )
}
