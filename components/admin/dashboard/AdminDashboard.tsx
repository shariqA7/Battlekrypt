"use client";

// The range-dependent part of the dashboard. Picking a range fetches just the
// new numbers from /api/admin/dashboard and swaps them in place: the page, the
// sidebar and the "Needs attention" queues stay exactly as they are, the
// numbers slide to their new values, and a shimmer covers the figures and
// charts only if the answer takes longer than a blink.
import { useCallback, useRef, useState } from "react";
import type { DashboardData } from "@/lib/services/admin-analytics";
import { Skeleton } from "@/components/ui/Skeleton";
import RangeDropdown from "./RangeDropdown";
import StatCard from "./StatCard";
import { ChartPanel, GrowBarList, TrendChart } from "./TrendCharts";

const sum = (pts: { value: number }[]) => pts.reduce((n, p) => n + p.value, 0);
const n = (v: number) => v.toLocaleString("en-US");

export default function AdminDashboard({
  initial,
  ranges,
}: {
  initial: DashboardData;
  ranges: { key: string; label: string }[];
}) {
  const [range, setRange] = useState<string>(initial.range);
  const [data, setData] = useState(initial);
  const [shimmer, setShimmer] = useState(false);
  const [error, setError] = useState(false);
  const latest = useRef(0); // id of the newest request; older answers are ignored
  const shown = useRef<string>(initial.range); // the range the data on screen is for
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const choose = useCallback(async (key: string) => {
    const id = ++latest.current;
    setRange(key);
    setError(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current === id && setShimmer(true), 120);
    window.history.replaceState(null, "", `?range=${key}`); // bookmarkable, no navigation

    try {
      const res = await fetch(`/api/admin/dashboard?range=${key}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as DashboardData;
      if (latest.current !== id) return;
      shown.current = next.range;
      setData(next);
    } catch {
      if (latest.current !== id) return;
      setRange(shown.current); // keep the picker honest about what is on screen
      window.history.replaceState(null, "", `?range=${shown.current}`);
      setError(true);
    } finally {
      if (latest.current === id) {
        clearTimeout(timer.current);
        setShimmer(false);
      }
    }
  }, []);

  const { stats: s, totals: t } = data;

  return (
    <section aria-label="Activity" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans font-bold text-bk-heading text-base">Activity</p>
          {shimmer ? (
            <Skeleton className="h-3.5 w-56 mt-1.5" />
          ) : (
            <p className="font-sans text-[12px] text-bk-muted mt-0.5">
              New activity for {data.rangeLong} · {data.periodLabel}
            </p>
          )}
        </div>
        <RangeDropdown value={range} options={ranges} onChange={choose} />
      </div>

      <p className="sr-only" aria-live="polite">
        {shimmer ? "Loading" : `Showing ${data.rangeLong}`}
      </p>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 border border-bk-live/50 bg-bk-surface px-4 py-2.5 font-sans text-[13px] text-bk-heading">
          <span>Couldn&apos;t load that period. The numbers below are still for {data.rangeLong}.</span>
          <button type="button" onClick={() => setError(false)} className="text-bk-gold-light underline shrink-0">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard loading={shimmer} index={4} icon="users" label="New accounts" value={s.users.current} current={s.users.current} previous={s.users.previous} hint={`${n(t.users)} total · ${n(t.players)} players`} />
        <StatCard loading={shimmer} index={5} icon="organizations" tone="teal" label="New organizations" value={s.organizers.current} current={s.organizers.current} previous={s.organizers.previous} hint={`${n(t.organizers)} total · ${t.pendingApps} pending`} />
        <StatCard loading={shimmer} index={6} icon="clubs" tone="amber" label="New clubs" value={s.clubs.current} current={s.clubs.current} previous={s.clubs.previous} hint={`${t.clubsActive} active · ${t.clubsPaid} paid`} />
        <StatCard loading={shimmer} index={7} icon="teams" label="New teams" value={s.teams.current} current={s.teams.current} previous={s.teams.previous} hint={`${n(t.teams)} total`} />
        <StatCard loading={shimmer} index={8} icon="tournaments" tone="teal" label="Tournaments created" value={s.tournaments.current} current={s.tournaments.current} previous={s.tournaments.previous} hint={`${t.liveTournaments} in progress now`} />
        <StatCard loading={shimmer} index={9} icon="registrations" tone="amber" label="Registrations" value={s.registrations.current} current={s.registrations.current} previous={s.registrations.previous} hint={`${n(t.registrations)} total`} />
        <StatCard loading={shimmer} index={10} icon="bans" tone="live" label="Bans issued" value={s.bans.current} current={s.bans.current} previous={s.bans.previous} hint={`${t.activeBans} active now`} />
        {data.revenueText !== null && (
          <StatCard loading={shimmer} index={11} icon="payments" label="Revenue recorded" text={data.revenueText} hint={`${data.paymentCount} payment${data.paymentCount === 1 ? "" : "s"}`} />
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartPanel title="New accounts" icon="users" total={shimmer ? undefined : sum(data.signups)} delay={600}>
          <TrendChart loading={shimmer} data={data.signups} unit="accounts" />
        </ChartPanel>
        <ChartPanel title="Sessions" icon="sessions" total={shimmer ? undefined : s.sessions.current} delay={650}>
          <TrendChart loading={shimmer} data={data.sessionsSeries} unit="sessions" barClass="bg-bk-teal" />
        </ChartPanel>
        <ChartPanel title="Registrations" icon="registrations" total={shimmer ? undefined : sum(data.registrationsSeries)} delay={700}>
          <TrendChart loading={shimmer} data={data.registrationsSeries} unit="registrations" barClass="bg-bk-amber" />
        </ChartPanel>
        <ChartPanel title="Top countries" icon="traffic" delay={750}>
          <GrowBarList loading={shimmer} data={data.topCountries} unit="visits" empty="No visits recorded in this period." />
          <a href="/admin/traffic" className="inline-block mt-4 font-sans text-[12px] text-bk-gold-light underline">
            Full traffic report
          </a>
        </ChartPanel>
      </div>
    </section>
  );
}
