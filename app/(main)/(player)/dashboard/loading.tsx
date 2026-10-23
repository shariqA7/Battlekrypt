import { DashboardPageSkeleton } from "@/components/ui/PageSkeletons";

// Shown instantly while this page's data loads.
export default function Loading() {
  return <DashboardPageSkeleton stats={3} />;
}
