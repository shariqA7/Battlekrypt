// Animated, dependency-free charts for the dashboard (server-rendered SVG/CSS;
// the motion is pure CSS, see globals.css).
import type { DashPoint } from "@/lib/services/admin-analytics";
import { AdminIcon } from "../AdminIcons";
import type { AdminIconName } from "../adminNav";

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

export function TrendChart({ data, height = 140, color = "var(--bk-text-gold-light)" }: { data: DashPoint[]; height?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const sum = data.reduce((n, d) => n + d.value, 0);
  if (sum === 0) return <p className="font-sans text-[12px] text-bk-muted py-10 text-center">Nothing recorded in this period.</p>;

  const w = 600;
  const gap = data.length > 60 ? 1 : 3;
  const bar = Math.max(2, (w - gap * (data.length - 1)) / Math.max(1, data.length));
  const stagger = Math.min(14, 600 / data.length); // ms between bars, ~0.6s total at most
  const mid = data[Math.floor(data.length / 2)];

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label="Trend chart">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={0} x2={w} y1={height * g} y2={height * g} stroke="var(--bk-border)" strokeOpacity={0.5} strokeDasharray="3 5" />
        ))}
        {data.map((d, i) => {
          const h = Math.max(d.value ? 3 : 0, (d.value / max) * (height - 6));
          return (
            <rect
              key={`${d.label}-${i}`}
              className="bk-bar hover:opacity-100"
              style={{ animationDelay: `${i * stagger}ms` }}
              x={i * (bar + gap)}
              y={height - h}
              width={bar}
              height={h}
              fill={color}
              opacity={0.85}
            >
              <title>{`${d.label}: ${d.value.toLocaleString("en-US")}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between font-sans text-[10px] text-bk-muted mt-1.5">
        <span>{data[0]?.label}</span>
        <span className="hidden sm:inline">{mid?.label}</span>
        <span>peak {max.toLocaleString("en-US")}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function GrowBarList({ data, empty = "Nothing recorded in this period." }: { data: DashPoint[]; empty?: string }) {
  if (data.length === 0) return <p className="font-sans text-[12px] text-bk-muted py-4">{empty}</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3">
      {data.map((d, i) => (
        <li key={d.label}>
          <div className="flex justify-between font-sans text-[12px] mb-1">
            <span className="text-bk-heading truncate pr-2">{d.label}</span>
            <span className="font-mono text-bk-muted">{d.value.toLocaleString("en-US")}</span>
          </div>
          <div className="h-1.5 bg-bk-bg overflow-hidden">
            <div className="bk-bar-x h-1.5 bg-bk-gold-light" style={{ width: `${(d.value / max) * 100}%`, animationDelay: `${i * 80}ms` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
