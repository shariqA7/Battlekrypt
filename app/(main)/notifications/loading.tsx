import { NarrowPageSkeleton } from "@/components/ui/PageSkeletons";

// Shown instantly while this page's data loads.
export default function Loading() {
  return <NarrowPageSkeleton width="max-w-2xl" rows={7} />;
}
