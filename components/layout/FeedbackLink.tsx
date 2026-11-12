"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Footer link to the feedback form. It passes the page the person is on (path only), so a
// "report a problem" message says where the problem was.
export default function FeedbackLink({ className, children }: { className?: string; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const href = path && !path.startsWith("/feedback") ? `/feedback?from=${encodeURIComponent(path)}` : "/feedback";
  return <Link href={href} className={className}>{children}</Link>;
}
