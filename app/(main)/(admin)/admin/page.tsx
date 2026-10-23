import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { DASH_RANGES, getDashboard, parseDashRange } from "@/lib/services/admin-analytics";
import { formatMoney } from "@/lib/money";
import { SectionHeading } from "@/components/ui/Panel";
import DashboardFrame from "@/components/admin/dashboard/DashboardFrame";
import StatCard from "@/components/admin/dashboard/StatCard";
import { ChartPanel, GrowBarList, TrendChart } from "@/components/admin/dashboard/TrendCharts";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdminPage();
  const range = parseDashRange((await searchParams).range);
  const d = await getDashboard(range);
  const { stats: s, totals: t } = d;
  const revenue = Object.entries(d.revenue);
  const rangeInfo = DASH_RANGES.find((r) => r.key === range)!;
  const sum = (pts: { value: number }[]) => pts.reduce((n, p) => n + p.value, 0);

  return (
    <DashboardFrame
      range={range}
      ranges={DASH_RANGES.map(({ key, label }) => ({ key, label }))}
      heading={
        <div>
          <SectionHeading>Dashboard</SectionHeading>
          <p className="font-sans text-[13px] text-bk-body pl-[19px]">
            New activity for {rangeInfo.long} <span className="text-bk-muted">· {d.periodLabel}</span>
          </p>
        </div>
      }
    >
      {/* key = range, so the entrance animations replay every time the filter changes */}
      <div key={range} className="space-y-6">
        {t.pendingApps > 0 && (
          <Link
            href="/admin/approvals"
            className="bk-rise flex items-center gap-3 bg-bk-surface border border-bk-gold-light/40 px-4 py-3 font-sans text-[13px] text-bk-heading hover:bg-bk-surface-hover transition-colors"
          >
            <span className="relative flex w-2.5 h-2.5" aria-hidden="true">
              <span className="bk-ping absolute inset-0 rounded-full bg-bk-amber" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-bk-amber" />
            </span>
            <span className="flex-1">
              {t.pendingApps} organization application{t.pendingApps === 1 ? "" : "s"} waiting for review.
            </span>
            <span className="text-bk-gold-light underline">Open approvals</span>
          </Link>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard index={0} icon="users" label="New accounts" value={s.users.current} current={s.users.current} previous={s.users.previous} hint={`${t.users.toLocaleString("en-US")} total · ${t.players.toLocaleString("en-US")} players`} />
          <StatCard index={1} icon="organizations" tone="teal" label="New organizations" value={s.organizers.current} current={s.organizers.current} previous={s.organizers.previous} hint={`${t.organizers.toLocaleString("en-US")} total · ${t.pendingApps} pending`} />
          <StatCard index={2} icon="clubs" tone="amber" label="New clubs" value={s.clubs.current} current={s.clubs.current} previous={s.clubs.previous} hint={`${t.clubsActive} active · ${t.clubsPaid} paid`} />
          <StatCard index={3} icon="teams" label="New teams" value={s.teams.current} current={s.teams.current} previous={s.teams.previous} hint={`${t.teams.toLocaleString("en-US")} total`} />
          <StatCard index={4} icon="tournaments" tone="teal" label="Tournaments created" value={s.tournaments.current} current={s.tournaments.current} previous={s.tournaments.previous} hint={`${t.liveTournaments} in progress now`} />
          <StatCard index={5} icon="registrations" tone="amber" label="Registrations" value={s.registrations.current} current={s.registrations.current} previous={s.registrations.previous} hint={`${t.registrations.toLocaleString("en-US")} total`} />
          <StatCard index={6} icon="bans" tone="live" label="Bans issued" value={s.bans.current} current={s.bans.current} previous={s.bans.previous} hint={`${t.activeBans} active now`} />
          <StatCard
            index={7}
            icon="payments"
            label="Revenue recorded"
            text={revenue.length ? revenue.map(([cur, amt]) => formatMoney(amt, cur)).join(" · ") : "—"}
            hint={`${d.paymentCount} payment${d.paymentCount === 1 ? "" : "s"}`}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <ChartPanel title="New accounts" icon="users" total={sum(d.signups)} delay={480}>
            <TrendChart data={d.signups} />
          </ChartPanel>
          <ChartPanel title="Sessions" icon="sessions" total={s.sessions.current} delay={540}>
            <TrendChart data={d.sessionsSeries} color="var(--bk-teal)" />
          </ChartPanel>
          <ChartPanel title="Registrations" icon="registrations" total={sum(d.registrationsSeries)} delay={600}>
            <TrendChart data={d.registrationsSeries} color="var(--bk-amber)" />
          </ChartPanel>
          <ChartPanel title="Top countries" icon="traffic" delay={660}>
            <GrowBarList data={d.topCountries} empty="No visits recorded in this period." />
            <Link href="/admin/traffic" className="inline-block mt-4 font-sans text-[12px] text-bk-gold-light underline">
              Full traffic report
            </Link>
          </ChartPanel>
        </div>
      </div>
    </DashboardFrame>
  );
}
