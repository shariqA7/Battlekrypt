import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getSeriesPublic } from "@/lib/services/scrim-series";
import { getTeamEntryStatus } from "@/lib/services/team-entry";
import { getClubEntryOptions } from "@/lib/services/club-entries";
import { SectionHeading } from "@/components/ui/Panel";
import TeamEntryGate from "@/app/(main)/(public)/tournaments/[id]/join/TeamEntryGate";
import BookingForm from "./BookingForm";

export const metadata: Metadata = { title: "Book sessions" };

export default async function BookSessionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const here = `/scrims/${slug}/book`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(here)}`);

  const data = await getSeriesPublic(slug);
  if (!data) notFound();
  const { series } = data;
  const now = new Date();
  const open = data.sessions.filter((s) => s.open && !s.full && s.startAt > now);

  const shell = (children: React.ReactNode) => (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
      <Link href={`/scrims/${slug}`} className="font-sans text-[12px] text-bk-gold-light hover:underline">← {series.name}</Link>
      <div className="mt-3 mb-2"><SectionHeading>Book sessions</SectionHeading></div>
      {children}
    </main>
  );

  if (series.status === "ended") return shell(<p className="font-sans text-[13px] text-bk-body pl-[19px]">This series has ended.</p>);
  if (open.length === 0) return shell(<p className="font-sans text-[13px] text-bk-body pl-[19px]">No sessions are open for sign-up right now. Check back soon.</p>);

  let teams: { id: string; name: string; members: { id: string; name: string }[] }[] = [];
  if (series.mode !== "solo") {
    const status = await getTeamEntryStatus(user.id, open[0].id);
    if (!status || !status.required) notFound();
    if (status.state !== "ready") {
      return shell(<TeamEntryGate state={status.state} gameName={status.gameName} clubName={status.clubName} ownsClub={status.ownsClub} next={here} />);
    }
    const options = await getClubEntryOptions(user.id, open[0].id);
    teams = (options?.teams ?? []).map((t) => ({ id: t.id, name: t.name, members: t.members.map((m) => ({ id: m.id, name: m.name })) }));
  } else {
    const profile = await prisma.playerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!profile) redirect(`/onboarding?redirectTo=${encodeURIComponent(here)}`);
  }

  // Times are shown in the organizer's time zone, the same for everyone.
  const tz = series.timezone;
  const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
  const clock = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  const weekday = (d: Date) => Number(new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d)}T00:00:00Z`).getUTCDay());

  return shell(
    <>
      <p className="font-sans text-[13px] text-bk-body pl-[19px] mb-5">
        {series.name} · {series.schedule} <span className="text-bk-muted">({tz})</span>. Pick the sessions you want and pay once for all of them.
      </p>
      <BookingForm
        slug={slug}
        paid={series.entryType === "paid"}
        fee={series.entryFeeAmount}
        currency={series.entryFeeCurrency}
        paymentInstructions={series.paymentInstructions}
        timezone={tz}
        teams={teams}
        sessions={open.map((s) => ({ id: s.id, day: day(s.startAt), time: clock(s.startAt), weekday: weekday(s.startAt), spotsLeft: s.capacity - s.taken }))}
      />
    </>
  );
}
