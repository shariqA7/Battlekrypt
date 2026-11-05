import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import { listMyWinnings, listPublicGiveaways, type GiveawayCard } from "@/lib/services/giveaways";
import FeatureOffNotice from "@/components/ui/FeatureOffNotice";
import LocalDate from "@/components/ui/LocalDate";

export const metadata = { title: "Giveaways · BattleKrypt" };

const KIND: Record<string, string> = { physical: "Physical prize", code: "Digital code", cash: "Cash prize" };
const MY_STATUS: Record<string, string> = {
  awaiting_details: "Send your delivery details", details_submitted: "Waiting for the host to send it", delivered: "Sent: please confirm when it arrives",
  confirmed: "Received", disputed: "Reported as not received",
};

function Card({ g }: { g: GiveawayCard }) {
  return (
    <li>
      <Link href={`/giveaways/${g.slug}`} className="block h-full bg-bk-surface border border-bk-border hover:border-bk-gold-light transition-colors">
        {g.prizeImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={g.prizeImageUrl} alt="" className="w-full h-40 object-cover border-b border-bk-border" />
        )}
        <div className="p-4">
          <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted">
            {g.host.sponsor ? `${g.host.sponsor.name} × ${g.host.name}` : g.host.name}
          </p>
          <h3 className="font-sans font-bold text-[16px] text-bk-heading mt-1">{g.title}</h3>
          <p className="font-sans text-[13px] text-bk-body mt-1">{g.prizeTitle}</p>
          <div className="flex flex-wrap gap-1.5 mt-3 font-sans text-[11px]">
            <span className="border border-bk-border px-2 py-0.5 text-bk-body">{KIND[g.prizeKind]}</span>
            <span className="border border-bk-border px-2 py-0.5 text-bk-body">{g.winnersCount} winner{g.winnersCount === 1 ? "" : "s"}</span>
            {g.verifiedOnly && <span className="border border-bk-gold-light/60 px-2 py-0.5 text-bk-gold-light">Verified members</span>}
            {g.entered && <span className="border border-bk-teal/60 px-2 py-0.5 text-bk-teal">You&apos;re in</span>}
          </div>
          <p className="font-sans text-[12px] text-bk-muted mt-3">
            {g.phase === "drawn" ? "Winners drawn" : g.phase === "closed" ? "Closed, winners coming soon" : g.phase === "upcoming" ? <>Starts <LocalDate iso={g.startsAt} format="long" /></> : <>Ends <LocalDate iso={g.endsAt} format="long" /></>}
            {" · "}{g.entries} entr{g.entries === 1 ? "y" : "ies"}
          </p>
        </div>
      </Link>
    </li>
  );
}

export default async function GiveawaysPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await getFeatureFlags()).giveaways) return <FeatureOffNotice title="Giveaways are paused">There are no giveaways right now. Please check back soon.</FeatureOffNotice>;
  const [{ live, drawn }, mine] = await Promise.all([listPublicGiveaways(user?.id ?? null), user ? listMyWinnings(user.id) : Promise.resolve([])]);

  return (
    <main className="flex-1 px-6 py-10 max-w-5xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">Giveaways</h1>
      <p className="font-sans text-bk-body text-[13px] mb-8">Win prizes from BattleKrypt, its partner brands and organizers. Winners are drawn at random. Some giveaways are for verified members (a paid plan) only.</p>

      {mine.length > 0 && (
        <section className="mb-10" aria-label="Your wins">
          <h2 className="font-sans font-bold text-[15px] text-bk-heading mb-2">You won</h2>
          <ul className="divide-y divide-bk-border border border-bk-teal/40">
            {mine.map((w) => (
              <li key={w.id}>
                <Link href={`/giveaways/${w.slug}`} className="px-3 py-2.5 font-sans text-[13px] flex flex-wrap items-baseline justify-between gap-2 hover:bg-bk-surface-hover">
                  <span className="text-bk-heading">{w.prizeTitle} <span className="text-bk-muted">· {w.title}</span></span>
                  <span className={w.status === "awaiting_details" ? "text-bk-gold-light font-bold" : "text-bk-muted"}>{MY_STATUS[w.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Open giveaways">
        <h2 className="font-sans font-bold text-[15px] text-bk-heading mb-3">Open now</h2>
        {live.length === 0 ? <p className="font-sans text-[13px] text-bk-muted">No giveaways are open right now.</p> : <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{live.map((g) => <Card key={g.id} g={g} />)}</ul>}
      </section>

      {drawn.length > 0 && (
        <section className="mt-10" aria-label="Recent winners">
          <h2 className="font-sans font-bold text-[15px] text-bk-heading mb-3">Recently drawn</h2>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{drawn.map((g) => <Card key={g.id} g={g} />)}</ul>
        </section>
      )}
    </main>
  );
}
