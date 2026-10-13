import type { ReactNode } from "react";

// Big mono figure + small uppercase label, used on profile pages.
export default function Stat({ value, label, gold = false }: { value: ReactNode; label: string; gold?: boolean }) {
  return (
    <div className="bg-bk-surface border border-bk-border p-4 min-w-0">
      <p className={`font-mono text-2xl break-words ${gold ? "text-bk-gold-light" : "text-bk-heading"}`}>{value}</p>
      <p className="font-sans text-bk-muted text-[11px] uppercase tracking-[1.2px] mt-1">{label}</p>
    </div>
  );
}
