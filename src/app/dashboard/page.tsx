import { PageShell } from '@/components/page-shell'
import { DashboardClient } from './dashboard-client'

// Static shell: no SSR auth/data (proxy.ts gates this route). Session, projects
// and summary load client-side — session/projects go BR→BR direct to Supabase,
// the daily summary streams from /api/clock/summary with a skeleton.
export default function DashboardPage() {
  return (
    <PageShell>
      <DashboardClient />
    </PageShell>
  )
}
