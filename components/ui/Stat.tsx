import type { ReactNode } from "react";

// Big mono figure + small uppercase label, used on profile and dashboard pages.
// Compact on phones so three-across rows don't break words at 320px.
export default function Stat({
  value,
  label,
  gold = false,
  className = "",
}: {
  value: ReactNode;
  label: string;
  gold?: boolean;
  className?: string;
}) {
  return (
    <div className={`bg-bk-surface border border-bk-border p-3 sm:p-4 min-w-0 ${className}`}>
      <p className={`font-mono text-xl sm:text-2xl break-words ${gold ? "text-bk-gold-light" : "text-bk-heading"}`}>{value}</p>
      <p className="font-sans text-bk-muted text-[10px] sm:text-[11px] uppercase tracking-[0.8px] sm:tracking-[1.2px] mt-1">{label}</p>
    </div>
  );
}
