// Dependency-free charts for the dashboard. Both have a numbered scale that
// re-fits to the data (see lib/chart-scale.ts) and grow smoothly when the
// numbers change. Plain HTML/CSS, so text stays crisp at any width.
import type { DashPoint } from "@/lib/services/admin-analytics";
import { niceScale, tickLabel } from "@/lib/chart-scale";
import { AdminIcon } from "../AdminIcons";
import type { AdminIconName } from "../adminNav";
import { Skeleton, SkeletonChart } from "@/components/ui/Skeleton";

export function ChartPanel({
  title,
  icon,
  total,
  delay = 0,
  children,
}: {
  title: string;
  icon: AdminIconName;
  total?: number;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="bk-rise bg-bk-surface border border-bk-border p-4 min-w-0" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="flex items-center gap-2 font-sans font-bold text-bk-heading text-base">
          <span className="text-bk-gold-light"><AdminIcon name={icon} size={18} /></span>
          {title}
        </p>
        {typeof total === "number" && <p className="font-mono text-[12px] text-bk-muted">{total.toLocaleString("en-US")} total</p>}
      </div>
      {children}
    </section>
  );
}

const AXIS_W = "2.25rem"; // width of the vertical numbers
const GAP = "0.5rem";

/** Vertical bars. `unit` names what the vertical numbers count ("accounts"). */
export function TrendChart({
  data,
  unit,
  barClass = "bg-bk-gold-light",
  height = 180,
  loading = false,
}: {
  data: DashPoint[];
  unit: string;
  barClass?: string;
  height?: number;
  loading?: boolean;
}) {
  if (loading) return <SkeletonChart height={height} />;

  const peak = Math.max(0, ...data.map((d) => d.value));
  if (peak === 0) return <p className="font-sans text-[12px] text-bk-muted py-12 text-center">Nothing recorded in this period.</p>;

  const { max, ticks } = niceScale(peak);
  const stagger = Math.min(14, 500 / data.length);
  const mid = data[Math.floor(data.length / 2)];

  return (
    <div>
      <p className="font-sans text-[10px] uppercase tracking-[1.2px] text-bk-muted mb-1.5">{unit}</p>
      <div className="flex" style={{ gap: GAP }}>
        {/* vertical scale */}
        <div className="relative shrink-0" style={{ width: AXIS_W, height }} aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 translate-y-1/2 font-mono text-[10px] leading-none text-bk-muted transition-[bottom] duration-500"
              style={{ bottom: `${(t / max) * 100}%` }}
            >
              {tickLabel(t)}
            </span>
          ))}
        </div>

        {/* plot */}
        <div className="relative flex-1 min-w-0" style={{ height }} role="img" aria-label={`${unit}: highest ${peak.toLocaleString("en-US")}`}>
          {ticks.map((t) => (
            <div
              key={t}
              className={`absolute inset-x-0 border-t transition-[bottom] duration-500 ${t === 0 ? "border-bk-border" : "border-dashed border-bk-border/50"}`}
              style={{ bottom: `${(t / max) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => (
              <div key={i} className="group flex-1 h-full flex items-end min-w-0" title={`${d.label}: ${d.value.toLocaleString("en-US")}`}>
                <div
                  className={`bk-bar w-full ${barClass} opacity-85 group-hover:opacity-100 transition-[height,opacity] duration-500 ease-out`}
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 3 : 0, animationDelay: `${i * stagger}ms` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* horizontal labels, lined up with the plot */}
      <div className="flex justify-between font-sans text-[10px] text-bk-muted mt-1.5" style={{ marginLeft: `calc(${AXIS_W} + ${GAP})` }}>
        <span>{data[0]?.label}</span>
        <span className="hidden sm:inline">{mid?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

const LABEL_W = "6.5rem";
const VALUE_W = "2.5rem";

/** Horizontal bars with a numbered scale underneath. */
export function GrowBarList({
  data,
  empty = "Nothing recorded in this period.",
  unit = "visits",
  loading = false,
}: {
  data: DashPoint[];
  empty?: string;
  unit?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3.5">
        {[88, 64, 46, 30, 18].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-[6.5rem] shrink-0" />
            <Skeleton className="h-2 flex-1" />
            <Skeleton className="h-3 w-8 shrink-0" />
          </div>
        ))}
      </div>
    );
  }
  if (data.length === 0 || Math.max(...data.map((d) => d.value)) === 0) {
    return <p className="font-sans text-[12px] text-bk-muted py-4">{empty}</p>;
  }

  const { max, ticks } = niceScale(Math.max(...data.map((d) => d.value)), 4); // narrow: fewer labels
  const cols = `${LABEL_W} minmax(0,1fr) ${VALUE_W}`;
  const plotInset = { left: `calc(${LABEL_W} + 0.75rem)`, right: `calc(${VALUE_W} + 0.75rem)` };

  return (
    <div>
      <p className="font-sans text-[10px] uppercase tracking-[1.2px] text-bk-muted mb-1.5">{unit}</p>
      <div className="relative">
        {/* vertical grid lines behind the bars */}
        <div className="absolute inset-y-0 pointer-events-none" style={plotInset} aria-hidden="true">
          {ticks.map((t) => (
            <div key={t} className={`absolute inset-y-0 border-l ${t === 0 ? "border-bk-border" : "border-dashed border-bk-border/50"}`} style={{ left: `${(t / max) * 100}%` }} />
          ))}
        </div>
        <ul className="relative space-y-3 py-1">
          {data.map((d, i) => (
            <li key={d.label} className="grid items-center gap-x-3" style={{ gridTemplateColumns: cols }}>
              <span className="font-sans text-[12px] text-bk-heading truncate" title={d.label}>{d.label}</span>
              <div className="h-2.5">
                <div
                  className="bk-bar-x h-2.5 bg-bk-gold-light transition-[width] duration-500 ease-out"
                  style={{ width: `${(d.value / max) * 100}%`, animationDelay: `${i * 80}ms` }}
                />
              </div>
              <span className="font-mono text-[12px] text-bk-muted text-right">{d.value.toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* numbers under the bars */}
      <div className="grid gap-x-3 mt-1" style={{ gridTemplateColumns: cols }} aria-hidden="true">
        <span />
        <div className="relative h-4">
          {ticks.map((t, i) => (
            <span
              key={t}
              className={`absolute font-mono text-[10px] text-bk-muted ${i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: `${(t / max) * 100}%` }}
            >
              {tickLabel(t)}
            </span>
          ))}
        </div>
        <span />
      </div>
    </div>
  );
}
