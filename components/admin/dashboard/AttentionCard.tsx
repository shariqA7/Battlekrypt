// A queue waiting on an admin: icon, count, and a link to where it is handled.
// Zero reads "All clear" in teal; anything waiting is amber with a pulsing dot.
import Link from "next/link";
import { AdminIcon } from "../AdminIcons";
import type { AdminIconName } from "../adminNav";
import CountUp from "./CountUp";

export default function AttentionCard({
  href,
  icon,
  label,
  count,
  index = 0,
}: {
  href: string;
  icon: AdminIconName;
  label: string;
  count: number;
  index?: number;
}) {
  const waiting = count > 0;
  return (
    <Link
      href={href}
      className={`bk-rise group flex items-center gap-3 bg-bk-surface border p-4 min-w-0 transition-colors hover:bg-bk-surface-hover ${
        waiting ? "border-bk-amber/50 hover:border-bk-amber" : "border-bk-border hover:border-bk-teal/60"
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <span className={`relative grid place-items-center w-10 h-10 shrink-0 bg-current/10 transition-transform duration-200 group-hover:scale-110 ${waiting ? "text-bk-amber" : "text-bk-teal"}`}>
        <AdminIcon name={icon} size={20} />
        {waiting && (
          <span className="absolute -top-1 -right-1 flex w-2.5 h-2.5" aria-hidden="true">
            <span className="bk-ping absolute inset-0 rounded-full bg-bk-amber" />
            <span className="relative w-2.5 h-2.5 rounded-full bg-bk-amber" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-sans text-[13px] text-bk-heading truncate">{label}</p>
        <p className={`font-sans text-[11px] ${waiting ? "text-bk-muted" : "text-bk-teal"}`}>{waiting ? "Waiting for review" : "All clear"}</p>
      </div>
      <p className={`font-mono text-2xl ${waiting ? "text-bk-heading" : "text-bk-faint"}`}>
        <CountUp value={count} />
      </p>
    </Link>
  );
}
