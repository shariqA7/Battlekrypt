import EmptyState, { EmptyIcons } from "@/components/ui/EmptyState";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resolvePlan } from "@/lib/plans";
import { listMySeries } from "@/lib/services/scrim-series";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import SeriesForm from "./SeriesForm";
import SeriesControls from "./SeriesControls";

export default async function OrganizerScrimsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/dashboard/scrims");
  const org = await prisma.organizerProfile.findUnique({ where: { userId: user.id } });
  if (!org) redirect("/organizer/register");

  const [plan, items] = await Promise.all([resolvePlan("organizer", org), listMySeries(user.id)]);
  const lim = plan.limits;
  const running = items.filter((s) => s.status !== "ended").length;
  const allowed = lim.maxScrimSeries === null || lim.maxScrimSeries > 0;
  const full = lim.maxScrimSeries !== null && running >= lim.maxScrimSeries;

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
      <Link href="/organizer/dashboard" className="font-sans text-[12px] text-bk-gold-light hover:underline">← Dashboard</Link>
      <div className="mt-3 mb-2"><SectionHeading>Recurring scrims</SectionHeading></div>
      <p className="font-sans text-bk-body text-[13px] mb-4 pl-[19px]">
        Run a scrim every day, on weekdays or weekends, or on days you choose, for a month or non-stop. Set it up once; each day&apos;s scrim is created for you and players pick which ones to join.
      </p>

      <div className="bg-bk-surface border border-bk-border px-4 py-3 mb-6 font-sans text-[13px] text-bk-heading">
        {plan.name} plan:{" "}
        {allowed
          ? `${lim.maxScrimSeries === null ? "unlimited" : `${running} of ${lim.maxScrimSeries}`} series, ${lim.maxSeriesDays === null ? "non-stop allowed" : `up to ${lim.maxSeriesDays} days each`}, ${lim.maxSlotsPerDay === null ? "any number of" : `up to ${lim.maxSlotsPerDay}`} session${lim.maxSlotsPerDay === 1 ? "" : "s"} a day.`
          : "recurring series aren't included. Upgrade to a paid plan to use them."}
        {!allowed && <> <Link href="/plans" className="text-bk-gold-light underline">See plans</Link></>}
      </div>

      {allowed && !full && <SeriesForm maxSlots={lim.maxSlotsPerDay} maxDays={lim.maxSeriesDays} />}
      {allowed && full && <p className="font-sans text-[13px] text-bk-body mb-6">You&apos;re running the most series your plan allows. End one, or upgrade, to start another.</p>}

      <div className="space-y-3">
        {items.length === 0 && <EmptyState compact icon={EmptyIcons.calendar} title="No scrim series yet" hint="Create a series to run daily scrims on a schedule." />}
        {items.map((s) => (
          <Panel key={s.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-sans font-bold text-bk-heading text-[15px]">{s.name}</p>
              <span className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-gold-light">{s.status}</span>
            </div>
            <p className="font-sans text-[12px] text-bk-muted mt-0.5">{s.game.name} · {s.schedule} ({s.timezone}) · {s._count.sessions} session{s._count.sessions === 1 ? "" : "s"} so far</p>
            {s.lastError && <p className="font-sans text-[12px] text-bk-live mt-1" role="alert">Last automatic update stopped: {s.lastError}</p>}
            <div className="flex flex-wrap gap-3 mt-2 font-sans text-[12px]">
              <Link href={`/scrims/${s.slug}`} className="text-bk-gold-light underline">Public page</Link>
            </div>
            <SeriesControls id={s.id} slug={s.slug} name={s.name} status={s.status} />
          </Panel>
        ))}
      </div>
    </main>
  );
}
