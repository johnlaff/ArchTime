export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[920px] mx-auto w-full px-4 sm:px-6 py-6">
      {children}
    </div>
  )
}
