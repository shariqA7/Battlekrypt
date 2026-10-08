import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { getOverview } from "@/lib/services/admin-analytics";
import { formatMoney } from "@/lib/money";
import { ColumnChart, BarList, Stat, Panel } from "@/components/admin/charts";

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const o = await getOverview();
  const c = o.counts;
  const revenue = Object.entries(o.revenue);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Overview</h1>
        <p className="font-sans text-[13px] text-bk-body">How the platform is doing right now.</p>
      </div>

      {(c.pendingApps > 0 || c.activeBans > 0) && (
        <Link href="/admin/approvals" className="block bg-bk-surface border border-bk-gold-light/40 px-4 py-3 font-sans text-[13px] text-bk-heading">
          {c.pendingApps > 0 && <>{c.pendingApps} organization application{c.pendingApps === 1 ? "" : "s"} waiting for review. </>}
          <span className="text-bk-gold-light underline">Open approvals</span>
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Accounts" value={c.users} hint={`${c.players} player profiles`} />
        <Stat label="Organizations" value={c.organizers} hint={`${c.pendingApps} pending`} />
        <Stat label="Clubs" value={c.clubsActive} hint={`${c.clubsPaid} paid · ${c.clubsDisbanded} disbanded`} />
        <Stat label="Teams" value={c.teams} />
        <Stat label="Tournaments" value={c.tournaments} hint={`${c.liveTournaments} in progress`} />
        <Stat label="Registrations" value={c.registrations} />
        <Stat label="Active bans" value={c.activeBans} />
        <Stat
          label="Revenue recorded"
          value={revenue.length ? revenue.map(([cur, amt]) => formatMoney(amt, cur)).join(" · ") : "—"}
          hint={`${o.paymentCount} payment${o.paymentCount === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="New accounts, last 30 days">
          <ColumnChart data={o.signups} />
        </Panel>
        <Panel title="Sessions, last 30 days">
          <ColumnChart data={o.sessionsPerDay} color="var(--bk-teal)" />
        </Panel>
      </div>

      <Panel title="Top countries (30 days)">
        <BarList data={o.topCountries} empty="No visits recorded yet." />
        <Link href="/admin/traffic" className="inline-block mt-3 font-sans text-[12px] text-bk-gold-light underline">
          Full traffic report
        </Link>
      </Panel>
    </div>
  );
}
