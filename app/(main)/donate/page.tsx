import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDonateOverview, listMyDonations } from "@/lib/services/donations";
import { formatMoney } from "@/lib/money";
import FeatureOffNotice from "@/components/ui/FeatureOffNotice";
import DonateForm from "./DonateForm";

export const metadata = { title: "Donate · BattleKrypt" };

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const money = (r: Record<string, number>) => {
  const parts = Object.entries(r).filter(([, v]) => v > 0).map(([c, v]) => formatMoney(v, c));
  return parts.length ? parts.join(" + ") : "—";
};
const STATUS: Record<string, string> = { pending: "Waiting for approval", approved: "Received, thank you", rejected: "Not approved" };

export default async function DonatePage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const { campaign } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [o, mine] = await Promise.all([getDonateOverview(user?.id ?? null), user ? listMyDonations(user.id) : Promise.resolve([])]);

  if (!o.enabled) return <FeatureOffNotice title="Donations are paused">The community fund isn&apos;t taking donations right now. Please check back soon.</FeatureOffNotice>;

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">Support the community</h1>
      <p className="font-sans text-bk-body text-[13px] mb-6">
        Donations go to BattleKrypt&apos;s community fund. We use it for tournament prize pools, giveaways and keeping the platform running, and we show below exactly where it went.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-8">
        {[["Raised", money(o.fund.raised)], ["Used so far", money(o.fund.allocated)], ["Still in the fund", money(o.fund.balance)]].map(([k, v]) => (
          <div key={k} className="bg-bk-surface border border-bk-border px-3 py-3">
            <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted">{k}</p>
            <p className="font-sans font-bold text-[16px] text-bk-heading break-words">{v}</p>
          </div>
        ))}
      </div>

      <DonateForm campaigns={o.campaigns} instructions={o.instructions} generalVerifiedOnly={o.generalVerifiedOnly} viewer={o.viewer} initialCampaign={campaign ?? null} />

      {mine.length > 0 && (
        <section className="mt-10" aria-label="Your donations">
          <h2 className="font-sans font-bold text-[15px] text-bk-heading mb-2">Your donations</h2>
          <ul className="divide-y divide-bk-border border border-bk-border">
            {mine.map((d) => (
              <li key={d.id} className="px-3 py-2.5 font-sans text-[12px] flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-bk-heading">{formatMoney(d.amount, d.currency)}<span className="text-bk-muted"> · {d.campaign ?? "General fund"} · {date(d.at)}</span></span>
                <span className={d.status === "rejected" ? "text-bk-live" : d.status === "approved" ? "text-bk-teal" : "text-bk-muted"}>
                  {STATUS[d.status]}{d.status === "rejected" && d.note ? `: ${d.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-label="Where the money went">
        <h2 className="font-sans font-bold text-[15px] text-bk-heading mb-2">Where the money went</h2>
        {o.allocations.length === 0 ? (
          <p className="font-sans text-[12px] text-bk-muted">Nothing has been spent from the fund yet. Every use will be listed here.</p>
        ) : (
          <ul className="divide-y divide-bk-border border border-bk-border">
            {o.allocations.map((a) => (
              <li key={a.id} className="px-3 py-2.5 font-sans text-[12px] flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-bk-heading">{a.purpose}{a.tournament && <span className="text-bk-muted"> · {a.tournament}</span>}</span>
                <span className="text-bk-body">{formatMoney(a.amount, a.currency)} <span className="text-bk-muted">· {date(a.at)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {o.supporters.length > 0 && (
        <section className="mt-10" aria-label="Recent supporters">
          <h2 className="font-sans font-bold text-[15px] text-bk-heading mb-2">Recent supporters</h2>
          <p className="font-sans text-[12px] text-bk-body">{o.supporters.map((s) => s.name).join(" · ")}</p>
        </section>
      )}

      <p className="font-sans text-[11px] text-bk-muted mt-10">
        Questions? See <Link href="/plans" className="underline">plans</Link> for verified membership, or contact support. Donations are not refundable once approved.
      </p>
    </main>
  );
}
