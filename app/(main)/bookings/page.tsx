import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyBookings, listMyChoices } from "@/lib/services/series-booking";
import { formatMoney } from "@/lib/money";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import ChoiceButtons from "./ChoiceButtons";

export const metadata = { title: "My bookings" };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ booked?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/bookings");
  const [choices, bookings, sp] = await Promise.all([listMyChoices(user.id), listMyBookings(user.id), searchParams]);
  const stamp = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "");

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
      <div className="mb-2"><SectionHeading>My bookings</SectionHeading></div>
      {sp.booked && <p className="font-sans text-[13px] text-bk-gold-light border border-bk-gold-light/40 px-4 py-3 mb-6">Booked. The organizer will confirm your payment, and you&apos;ll be notified.</p>}

      {choices.length > 0 && (
        <section className="mb-8">
          <h2 className="font-sans font-bold text-bk-heading text-[15px] mb-3">Sessions that were cancelled: choose what happens</h2>
          <div className="space-y-3">
            {choices.map((c) => (
              <Panel key={c.registrationId} className="p-4">
                <p className="font-sans font-bold text-bk-heading text-[14px]">{c.sessionName}</p>
                <p className="font-sans text-[12px] text-bk-muted mt-0.5">
                  Cancelled by the organizer. You paid {c.fee !== null && c.currency ? formatMoney(c.fee, c.currency) : "the entry fee"} for it. Choose by {stamp(c.deadline)}, or you&apos;ll be moved to the next session.
                </p>
                <ChoiceButtons registrationId={c.registrationId} next={c.next ? { name: c.next.name, when: stamp(c.next.startAt) } : null} />
              </Panel>
            ))}
          </div>
        </section>
      )}

      <h2 className="font-sans font-bold text-bk-heading text-[15px] mb-3">Bookings</h2>
      {bookings.length === 0 && <p className="font-sans text-[13px] text-bk-muted">No bookings yet. Open a scrim series and choose &quot;Book several sessions&quot;.</p>}
      <div className="space-y-3">
        {bookings.map((b) => (
          <Panel key={b.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/scrims/${b.series.slug}`} className="font-sans font-bold text-bk-heading text-[14px] hover:underline">{b.series.name}</Link>
              <span className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-gold-light">{b.status === "pending" ? "Waiting for the organizer" : b.status}</span>
            </div>
            <p className="font-sans text-[12px] text-bk-muted mt-0.5">{b.sessionCount} session{b.sessionCount === 1 ? "" : "s"}{b.total && b.currency ? ` · ${formatMoney(b.total, b.currency)} paid` : " · free"}</p>
            <ul className="mt-2 space-y-1">
              {b.sessions.map((s) => (
                <li key={s.registrationId} className="font-sans text-[12px] text-bk-body flex flex-wrap justify-between gap-2">
                  <Link href={`/tournaments/${s.slug}`} className="hover:underline">{s.name}</Link>
                  <span className="text-bk-muted">
                    {s.tournamentStatus === "cancelled" ? (s.choice === "moved" ? "cancelled, moved" : s.choice === "refund" ? "cancelled, refund requested" : s.choice === "pending" ? "cancelled, waiting for your choice" : "cancelled")
                      : s.carriedOver ? "moved here from a cancelled session" : s.status}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </main>
  );
}
