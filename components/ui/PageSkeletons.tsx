// Whole-page shimmer layouts for loading.tsx files. Each one copies the
// container width of the real pages it stands in for, so the page doesn't
// shift when the content arrives.
import { LoadingRegion, Skeleton, SkeletonCardGrid, SkeletonChart, SkeletonHeading, SkeletonList, SkeletonStatGrid } from "./Skeleton";

/** Browse pages: tournaments, games, rankings, organizers (max-w-6xl + card grid). */
export function GridPageSkeleton({ filters = true, count = 9 }: { filters?: boolean; count?: number }) {
  return (
    <LoadingRegion>
      <main className="flex-1 px-5 sm:px-6 py-10 max-w-6xl mx-auto w-full">
        <SkeletonHeading />
        {filters && (
          <div className="flex flex-wrap gap-2 mb-6">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-28 sm:w-36" />
            ))}
          </div>
        )}
        <SkeletonCardGrid count={count} />
      </main>
    </LoadingRegion>
  );
}

/** Narrow list pages: challenges, notifications, live, profiles. */
export function NarrowPageSkeleton({
  width = "max-w-3xl",
  stats = 0,
  rows = 6,
}: {
  width?: "max-w-2xl" | "max-w-3xl";
  stats?: number;
  rows?: number;
}) {
  return (
    <LoadingRegion>
      <main className={`flex-1 px-5 sm:px-6 py-10 ${width} mx-auto w-full`}>
        <SkeletonHeading />
        {stats > 0 && <SkeletonStatGrid count={stats} className="grid-cols-2 sm:grid-cols-3 mb-8" />}
        <SkeletonList rows={rows} />
      </main>
    </LoadingRegion>
  );
}

/** Profile pages: avatar + name, a few tiles, a list. */
export function ProfilePageSkeleton() {
  return (
    <LoadingRegion>
      <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="h-16 w-16 shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-6 w-48 max-w-full" />
            <Skeleton className="h-3.5 w-32 mt-2.5" />
          </div>
        </div>
        <SkeletonStatGrid count={4} className="grid-cols-2 mb-8" />
        <SkeletonList rows={4} />
      </main>
    </LoadingRegion>
  );
}

/** Player / organizer / club dashboards: strip on top, stat tiles, queue. */
export function DashboardPageSkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <LoadingRegion>
      <div className="w-full max-w-5xl mx-auto px-5 sm:px-6 pt-8">
        <Skeleton className="h-11 w-full" />
      </div>
      <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
        <SkeletonHeading />
        <SkeletonStatGrid count={stats} className="grid-cols-2 sm:grid-cols-4 mb-8" />
        <SkeletonList rows={5} />
      </main>
    </LoadingRegion>
  );
}

/** Tournament detail: banner, title block, then main column + side card. */
export function DetailPageSkeleton() {
  return (
    <LoadingRegion>
      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <div className="pt-8">
          <Skeleton className="h-40 sm:h-56 w-full" />
          <Skeleton className="h-9 w-3/4 sm:w-1/2 mt-6" />
          <Skeleton className="h-4 w-full max-w-2xl mt-4" />
          <Skeleton className="h-4 w-2/3 max-w-xl mt-2.5" />
        </div>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] py-10 sm:py-12">
          <div className="space-y-6">
            <SkeletonStatGrid count={3} className="grid-cols-3" />
            <SkeletonList rows={4} />
          </div>
          <div className="bg-bk-surface border border-bk-border p-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-40 mt-3" />
            <Skeleton className="h-3 w-full mt-5" />
            <Skeleton className="h-3 w-5/6 mt-2.5" />
            <Skeleton className="h-12 w-full mt-6" />
          </div>
        </div>
      </main>
    </LoadingRegion>
  );
}

/** Admin pages (the sidebar and breadcrumbs stay; only the content shimmers). */
export function AdminPageSkeleton() {
  return (
    <LoadingRegion>
      <SkeletonHeading />
      <SkeletonStatGrid count={4} className="grid-cols-2 lg:grid-cols-4 mb-6" />
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-bk-surface border border-bk-border p-4">
            <Skeleton className="h-4 w-36 mb-4" />
            <SkeletonChart height={150} />
          </div>
        ))}
      </div>
      <SkeletonList rows={5} />
    </LoadingRegion>
  );
}
