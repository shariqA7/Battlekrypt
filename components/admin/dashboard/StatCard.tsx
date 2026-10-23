// One dashboard number: icon, label, animated value, "vs previous period"
// change, and a small hint line. While `loading`, only the changing parts
// (value, change, hint) turn into shimmer; the icon and label stay put.
import { AdminIcon } from "../AdminIcons";
import type { AdminIconName } from "../adminNav";
import { Skeleton } from "@/components/ui/Skeleton";
import CountUp from "./CountUp";

const TONES = {
  gold: "text-bk-gold-light",
  teal: "text-bk-teal",
  amber: "text-bk-amber",
  live: "text-bk-live",
} as const;

function Delta({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return null;
  if (previous === 0) {
    return current > 0 ? <span className="font-mono text-[11px] text-bk-teal">▲ new</span> : <span className="font-mono text-[11px] text-bk-faint">— 0%</span>;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="font-mono text-[11px] text-bk-faint">— 0%</span>;
  return (
    <span className={`font-mono text-[11px] ${pct > 0 ? "text-bk-teal" : "text-bk-live"}`} title="Compared with the period before">
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

export default function StatCard({
  icon,
  tone = "gold",
  label,
  value,
  text,
  current,
  previous = null,
  hint,
  index = 0,
  loading = false,
}: {
  icon: AdminIconName;
  tone?: keyof typeof TONES;
  label: string;
  /** Whole-number value: animated count-up. */
  value?: number;
  /** Pre-formatted value (money): shown as is. */
  text?: string;
  /** Number used for the comparison arrow. */
  current?: number;
  previous?: number | null;
  hint?: string;
  index?: number;
  loading?: boolean;
}) {
  return (
    <div
      className="bk-rise group bg-bk-surface border border-bk-border p-4 min-w-0 transition-colors hover:border-bk-gold-light/50 hover:bg-bk-surface-hover"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-sans text-[11px] uppercase tracking-[1.2px] text-bk-muted">{label}</p>
        <span className={`grid place-items-center w-9 h-9 shrink-0 bg-current/10 transition-transform duration-200 group-hover:scale-110 ${TONES[tone]}`}>
          <AdminIcon name={icon} size={18} />
        </span>
      </div>
      {loading ? (
        <>
          <Skeleton className="h-7 w-24 mt-2" />
          <Skeleton className="h-3 w-32 mt-2.5" />
        </>
      ) : (
        <>
          <p className="font-mono text-2xl text-bk-heading mt-2 break-words">
            {typeof value === "number" ? <CountUp value={value} /> : text}
          </p>
          <div className="flex items-center justify-between gap-2 mt-1.5 min-h-[16px]">
            {hint ? <p className="font-sans text-[11px] text-bk-muted truncate">{hint}</p> : <span />}
            {typeof current === "number" && <Delta current={current} previous={previous} />}
          </div>
        </>
      )}
    </div>
  );
}
