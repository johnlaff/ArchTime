'use client'

import dynamic from 'next/dynamic'

// Lazy: keeps Recharts + react-activity-calendar out of the dashboard's initial
// route bundle (perf guardrail, docs/adr/0002). ssr:false because the heatmap/chart
// libs are client-only; the dashboard shell stays instant.
const ActivityPanelContent = dynamic(() => import('./activity-panel-content'), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3" aria-hidden="true">
        <div className="animate-shimmer h-4 w-28 rounded" />
        <div className="animate-shimmer h-8 w-full rounded-lg" />
        <div className="animate-shimmer h-[120px] w-full rounded-lg" />
      </div>
    </div>
  ),
})

export function ActivityPanel() {
  return <ActivityPanelContent />
}
