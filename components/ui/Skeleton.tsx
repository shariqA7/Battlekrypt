// Shimmer placeholders. Shapes mirror the real pages (same containers, same
// card grids) so nothing jumps when the content arrives. Pure markup, usable in
// server components, loading.tsx files and client components alike.
import type { ReactNode } from "react";

/** One shimmering block. Size it with className (h-4 w-24, etc). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`bk-shimmer ${className}`} />;
}

/** Wrap a loading.tsx so screen readers announce it once. */
export function LoadingRegion({ children, label = "Loading" }: { children: ReactNode; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

/** Gold-bar heading + one line under it (matches SectionHeading). */
export function SkeletonHeading({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="mb-6">
      <div className="border-l-[3px] border-bk-gold-from pl-4">
        <Skeleton className="h-7 w-56 sm:w-72" />
      </div>
      {subtitle && <Skeleton className="h-3.5 w-64 max-w-full mt-3 ml-[19px]" />}
    </div>
  );
}

export function SkeletonCard({ lines = 2, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`bg-bk-surface border border-bk-border p-4 ${className}`}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-6 w-20 mt-3" />
      {Array.from({ length: Math.max(0, lines - 1) }).map((_, i) => (
        <Skeleton key={i} className={`h-3 mt-2.5 ${i % 2 ? "w-1/2" : "w-3/4"}`} />
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ count = 6, className = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={3} />
      ))}
    </div>
  );
}

/** Small number tiles (dashboards). */
export function SkeletonStatGrid({ count = 4, className = "grid-cols-2 sm:grid-cols-4" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-bk-surface border border-bk-border p-4">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-8" />
          </div>
          <Skeleton className="h-7 w-16 mt-3" />
          <Skeleton className="h-3 w-24 mt-2.5" />
        </div>
      ))}
    </div>
  );
}

/** A list of rows inside a bordered panel (tables, queues, notifications). */
export function SkeletonList({ rows = 6, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`bg-bk-surface border border-bk-border divide-y divide-bk-border-soft ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-9 w-9 shrink-0" />
          <div className="flex-1 min-w-0">
            <Skeleton className={`h-3.5 ${i % 3 === 0 ? "w-2/3" : i % 3 === 1 ? "w-1/2" : "w-3/5"}`} />
            <Skeleton className="h-3 w-1/3 mt-2" />
          </div>
          <Skeleton className="h-6 w-14 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Chart area: axis ticks plus bars of varying height. */
export function SkeletonChart({ height = 160, bars = 24 }: { height?: number; bars?: number }) {
  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between w-9 shrink-0 items-end" style={{ height }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-2.5 w-5" />
        ))}
      </div>
      <div className="flex-1 flex items-end gap-[3px]" style={{ height }}>
        {Array.from({ length: bars }).map((_, i) => (
          <Skeleton key={i} className="flex-1" />
        ))}
      </div>
    </div>
  );
}
