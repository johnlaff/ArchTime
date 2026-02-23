export default function HistoricoLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-28 bg-muted animate-pulse rounded-md" />
      <div className="flex items-center justify-between">
        <div className="h-9 w-9 bg-muted animate-pulse rounded-md" />
        <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        <div className="h-9 w-9 bg-muted animate-pulse rounded-md" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  )
}
