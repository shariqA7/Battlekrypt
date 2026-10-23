import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { DASH_RANGES, getDashboard, parseDashRange } from "@/lib/services/admin-analytics";
import { getAttentionCounts } from "@/lib/services/admin-attention";
import { formatMoney } from "@/lib/money";
import { SectionHeading } from "@/components/ui/Panel";
import DashboardFrame from "@/components/admin/dashboard/DashboardFrame";
import StatCard from "@/components/admin/dashboard/StatCard";
import AttentionCard from "@/components/admin/dashboard/AttentionCard";
import { ChartPanel, GrowBarList, TrendChart } from "@/components/admin/dashboard/TrendCharts";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdminPage();
  const range = parseDashRange((await searchParams).range);
  const [d, attention] = await Promise.all([getDashboard(range), getAttentionCounts()]);
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
        {/* Right-now queues: not affected by the time filter */}
        <section aria-label="Needs attention" className="space-y-3">
          <div className="flex items-center gap-3">
            <p className="font-sans font-bold text-bk-heading text-base">Needs attention</p>
            <span className={`font-mono text-[11px] px-2 py-0.5 ${attention.total > 0 ? "bg-bk-amber/15 text-bk-amber" : "bg-bk-teal/15 text-bk-teal"}`}>
              {attention.total > 0 ? `${attention.total} waiting` : "all clear"}
            </span>
            <span className="font-sans text-[11px] text-bk-muted">right now, whatever the period</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AttentionCard index={0} href="/admin/approvals" icon="payments" label="Plan payments" count={attention.items.planPayments} />
            <AttentionCard index={1} href="/admin/approvals" icon="organizations" label="Organizer applications" count={attention.items.organizers} />
            <AttentionCard index={2} href="/admin/approvals" icon="clubs" label="Club upgrades & name claims" count={attention.items.clubs} />
            <AttentionCard index={3} href="/admin/approvals" icon="tournaments" label="Tournament reviews" count={attention.items.tournamentReviews} />
            <AttentionCard index={4} href="/admin/approvals" icon="bans" label="Challenge disputes & reports" count={attention.items.challenges} />
            <AttentionCard index={5} href="/admin/approvals" icon="registrations" label="Parental-consent cases" count={attention.items.consent} />
            <AttentionCard index={6} href="/admin/approvals" icon="sessions" label="Game requests" count={attention.items.games} />
            <AttentionCard index={7} href="/admin/institutions" icon="institutions" label="Institutions to verify" count={attention.items.institutions} />
            <AttentionCard index={8} href="/admin/change-requests" icon="changeRequests" label="Tournament change requests" count={attention.items.changeRequests} />
          </div>
        </section>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard index={4} icon="users" label="New accounts" value={s.users.current} current={s.users.current} previous={s.users.previous} hint={`${t.users.toLocaleString("en-US")} total · ${t.players.toLocaleString("en-US")} players`} />
          <StatCard index={5} icon="organizations" tone="teal" label="New organizations" value={s.organizers.current} current={s.organizers.current} previous={s.organizers.previous} hint={`${t.organizers.toLocaleString("en-US")} total · ${t.pendingApps} pending`} />
          <StatCard index={6} icon="clubs" tone="amber" label="New clubs" value={s.clubs.current} current={s.clubs.current} previous={s.clubs.previous} hint={`${t.clubsActive} active · ${t.clubsPaid} paid`} />
          <StatCard index={7} icon="teams" label="New teams" value={s.teams.current} current={s.teams.current} previous={s.teams.previous} hint={`${t.teams.toLocaleString("en-US")} total`} />
          <StatCard index={8} icon="tournaments" tone="teal" label="Tournaments created" value={s.tournaments.current} current={s.tournaments.current} previous={s.tournaments.previous} hint={`${t.liveTournaments} in progress now`} />
          <StatCard index={9} icon="registrations" tone="amber" label="Registrations" value={s.registrations.current} current={s.registrations.current} previous={s.registrations.previous} hint={`${t.registrations.toLocaleString("en-US")} total`} />
          <StatCard index={10} icon="bans" tone="live" label="Bans issued" value={s.bans.current} current={s.bans.current} previous={s.bans.previous} hint={`${t.activeBans} active now`} />
          <StatCard
            index={11}
            icon="payments"
            label="Revenue recorded"
            text={revenue.length ? revenue.map(([cur, amt]) => formatMoney(amt, cur)).join(" · ") : "—"}
            hint={`${d.paymentCount} payment${d.paymentCount === 1 ? "" : "s"}`}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <ChartPanel title="New accounts" icon="users" total={sum(d.signups)} delay={600}>
            <TrendChart data={d.signups} />
          </ChartPanel>
          <ChartPanel title="Sessions" icon="sessions" total={s.sessions.current} delay={650}>
            <TrendChart data={d.sessionsSeries} color="var(--bk-teal)" />
          </ChartPanel>
          <ChartPanel title="Registrations" icon="registrations" total={sum(d.registrationsSeries)} delay={700}>
            <TrendChart data={d.registrationsSeries} color="var(--bk-amber)" />
          </ChartPanel>
          <ChartPanel title="Top countries" icon="traffic" delay={750}>
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
