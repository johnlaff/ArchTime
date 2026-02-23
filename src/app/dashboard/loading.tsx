export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-8 w-16 bg-muted animate-pulse rounded-md" />
        <div className="h-6 w-6 bg-muted animate-pulse rounded-md" />
      </div>
      <div className="h-20 w-full bg-muted animate-pulse rounded-2xl" />
      <div className="h-24 w-full bg-muted animate-pulse rounded-xl" />
      <div className="space-y-2">
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 w-full bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  )
}
