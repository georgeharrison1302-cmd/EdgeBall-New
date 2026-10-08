export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`.trim()} />;
}

export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </main>
  );
}

export function HubSkeleton() {
  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading match">
      <Skeleton className="h-4 w-48" />
      <div className="space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-12 w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
    </main>
  );
}
