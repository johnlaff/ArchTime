import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { getCachedUser } from '@/lib/server/sidebar-data'
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

export default async function HistoricoPage() {
  const user = await getCachedUser()
  if (!user) return null
  const month = getCurrentMonth()

  return (
    <PageShell>
      <Suspense fallback={<HistoricoLoading />}>
        <HistoricoInitialData userId={user.id} month={month} />
      </Suspense>
    </PageShell>
  )
}
