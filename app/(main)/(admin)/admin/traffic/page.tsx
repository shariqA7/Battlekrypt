import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { getTraffic } from "@/lib/services/admin-analytics";
import { countryName } from "@/lib/geo";
import { ColumnChart, BarList, Stat, Panel } from "@/components/admin/charts";

const RANGES = [7, 30, 90];

export default async function AdminTrafficPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdminPage();
  const { days: d } = await searchParams;
  const days = RANGES.includes(Number(d)) ? Number(d) : 30;
  const t = await getTraffic(days);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Traffic</h1>
          <p className="font-sans text-[13px] text-bk-body">Who visits, from where and on what. One row per session.</p>
        </div>
        <div className="flex gap-3 font-sans text-[12px]">
          {RANGES.map((r) => (
            <Link key={r} href={`/admin/traffic?days=${r}`} className={r === days ? "text-bk-heading underline" : "text-bk-muted"}>
              {r} days
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Sessions" value={t.total} />
        <Stat label="Signed in" value={t.signedIn} hint={`${t.total ? Math.round((t.signedIn / t.total) * 100) : 0}% of sessions`} />
        <Stat label="Unique IPs" value={t.uniqueIps} />
      </div>

      <Panel title="Sessions per day"><ColumnChart data={t.perDay} color="var(--bk-teal)" /></Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Countries"><BarList data={t.countries} empty="No location data — it needs a host that sends country headers (Vercel, Cloudflare)." /></Panel>
        <Panel title="Regions"><BarList data={t.regions} empty="No region data yet." /></Panel>
        <Panel title="Devices"><BarList data={t.devices} /></Panel>
        <Panel title="Browsers"><BarList data={t.browsers} /></Panel>
        <Panel title="Operating systems"><BarList data={t.systems} /></Panel>
        <Panel title="Top landing pages"><BarList data={t.paths} /></Panel>
        <Panel title="Referring sites"><BarList data={t.referrers} empty="No external referrers." /></Panel>
      </div>

      <Panel title="Recent sessions (latest 100)">
        <div className="overflow-x-auto -mx-1">
          <table className="w-full font-sans text-[12px]">
            <thead className="text-bk-muted text-left uppercase tracking-[0.6px] text-[10px]">
              <tr>
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">User</th>
                <th className="px-2 py-2">IP address</th>
                <th className="px-2 py-2">Location</th>
                <th className="px-2 py-2">Device</th>
                <th className="px-2 py-2">Landed on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bk-border">
              {t.recent.map((s) => (
                <tr key={s.id}>
                  <td className="px-2 py-2 text-bk-muted whitespace-nowrap">{s.createdAt.toLocaleString()}</td>
                  <td className="px-2 py-2">{s.user ? s.user.email : <span className="text-bk-muted">Visitor</span>}</td>
                  <td className="px-2 py-2 font-mono">{s.ip ?? "—"}</td>
                  <td className="px-2 py-2">{[s.city, s.region, s.country ? countryName(s.country) : null].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-2 py-2">{s.deviceType} · {s.os} · {s.browser}</td>
                  <td className="px-2 py-2 text-bk-muted">{s.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
