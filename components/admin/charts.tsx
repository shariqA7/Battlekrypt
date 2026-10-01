// Dependency-free charts for the admin panel (server-rendered SVG / CSS).
import type { SeriesPoint } from "@/lib/services/admin-analytics";

export function ColumnChart({
  data,
  height = 120,
  color = "var(--color-bk-gold-light, #C9A24B)",
}: {
  data: SeriesPoint[];
  height?: number;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 600;
  const gap = 3;
  const bar = Math.max(2, (w - gap * (data.length - 1)) / Math.max(1, data.length));
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label="Chart">
        {data.map((d, i) => {
          const h = Math.max(d.value ? 2 : 0, (d.value / max) * (height - 4));
          return (
            <rect key={d.label} x={i * (bar + gap)} y={height - h} width={bar} height={h} fill={color} opacity={0.9}>
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between font-sans text-[10px] text-bk-muted mt-1">
        <span>{data[0]?.label.slice(5)}</span>
        <span>peak {max}</span>
        <span>{data[data.length - 1]?.label.slice(5)}</span>
      </div>
    </div>
  );
}

export function BarList({ data, empty = "No data yet." }: { data: SeriesPoint[]; empty?: string }) {
  if (data.length === 0) return <p className="font-sans text-[12px] text-bk-muted">{empty}</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label}>
          <div className="flex justify-between font-sans text-[12px] mb-1">
            <span className="text-bk-heading truncate pr-2">{d.label}</span>
            <span className="text-bk-muted">{d.value}</span>
          </div>
          <div className="h-1.5 bg-bk-bg">
            <div className="h-1.5 bg-bk-gold-light" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-bk-surface border border-bk-border p-4">
      <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted">{label}</p>
      <p className="font-sans font-extrabold text-2xl text-bk-heading mt-1">{value}</p>
      {hint && <p className="font-sans text-[11px] text-bk-muted mt-1">{hint}</p>}
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-bk-surface border border-bk-border p-4">
      <p className="font-sans font-medium text-bk-heading text-sm mb-3">{title}</p>
      {children}
    </section>
  );
}
