import EmptyState, { EmptyIcons } from "@/components/ui/EmptyState";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPlanSettings, listPlans } from "@/lib/services/plan-requests";
import { describeExtras, listPlanFields } from "@/lib/services/plan-fields";
import { describeLimits, PAID_PERKS } from "@/lib/plan-copy";
import { formatMoney } from "@/lib/money";
import { buttonClass } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Plans",
  description: "Paid plans for players, clubs and organizers. Playing, joining and your rating are always free.",
};

type Audience = "player" | "club" | "organizer";

const SECTIONS: { id: string; audience: Audience; title: string; blurb: string }[] = [
  { id: "players", audience: "player", title: "Player plans", blurb: "For people who play." },
  { id: "clubs", audience: "club", title: "Club plans", blurb: "For clubs with a roster and several teams." },
  { id: "organizers", audience: "organizer", title: "Organizer plans", blurb: "For people and organizations who host events." },
];

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [plans, fields, settings] = await Promise.all([
    listPlans({ activeOnly: true }),
    listPlanFields(),
    getPlanSettings(),
  ]);

  // Choosing a plan happens in My plans (payment proof + admin approval), which needs a login.
  const ctaHref = user ? "/plans" : "/login?redirectTo=/plans";
  const ctaLabel = user ? "Choose in My plans" : "Log in to choose";

  return (
    <main className="flex-1 px-4 sm:px-6 py-10 sm:py-14 max-w-[1232px] mx-auto w-full">
      <header className="max-w-2xl mb-8">
        <h1 className="font-sans font-extrabold text-3xl text-bk-heading mb-3">Plans</h1>
        <p className="font-sans text-bk-body text-[15px]">
          Joining tournaments, playing and your rating are always free. Paid plans add convenience:
          fewer limits, no ads and a Verified badge.
        </p>
        <nav aria-label="Jump to a section" className="mt-5 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="font-sans text-[12px] font-medium px-3 py-1.5 border border-bk-border text-bk-body hover:text-bk-heading hover:border-bk-gold-from"
            >
              {s.title}
            </a>
          ))}
        </nav>
      </header>

      {SECTIONS.map((sec) => {
        const options = plans.filter((p) => p.audience === sec.audience && p.isPaid);
        return (
          <section key={sec.id} id={sec.id} className="scroll-mt-24 mb-14">
            <h2 className="font-sans font-bold text-xl text-bk-heading">{sec.title}</h2>
            <p className="font-sans text-[13px] text-bk-muted mt-1 mb-5">{sec.blurb}</p>

            {options.length === 0 ? (
              <div className="border border-bk-border bg-bk-surface"><EmptyState compact icon={EmptyIcons.document} title="No paid plans available right now" hint="Everything you need to play is free. Check back for new plans." /></div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {options.map((p) => {
                  const perks = [...describeLimits(p.audience, p.limits), ...PAID_PERKS];
                  const extras = describeExtras(
                    fields.filter((f) => f.audience === p.audience),
                    p.extras
                  );
                  const showDeposit = settings.depositEnabled && p.depositAmount && p.priceCurrency;
                  return (
                    <div key={p.code} className="bg-bk-surface border border-bk-border p-5 flex flex-col">
                      <p className="font-sans font-bold text-bk-heading text-[17px]">{p.name}</p>
                      {p.priceAmount !== null && p.priceCurrency && (
                        <p className="font-mono text-bk-gold-light text-[15px] mt-1">
                          {formatMoney(p.priceAmount, p.priceCurrency)}{" "}
                          <span className="text-bk-muted text-[12px]">/ {p.durationDays} days</span>
                        </p>
                      )}
                      {showDeposit && (
                        <p className="font-sans text-[12px] text-bk-body mt-1">
                          + refundable security deposit{" "}
                          <span className="font-mono text-bk-heading">
                            {formatMoney(p.depositAmount!, p.priceCurrency!)}
                          </span>
                        </p>
                      )}
                      <ul className="mt-4 font-sans text-[13px] text-bk-body list-disc pl-5 space-y-1 flex-1">
                        {perks.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                        {extras.map((x) => (
                          <li key={x.label}>
                            {x.label}
                            {x.value !== "Included" ? `: ${x.value}` : ""}
                          </li>
                        ))}
                      </ul>
                      <Link href={ctaHref} className={buttonClass("outline", "md", "mt-5 w-full justify-center text-center")}>
                        {ctaLabel}
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}

            {sec.audience === "club" && (
              <p className="font-sans text-[12px] text-bk-muted mt-3">
                No club yet? <Link href="/club/register" className="text-bk-gold-light underline">Register a club</Link>.
              </p>
            )}
            {sec.audience === "organizer" && (
              <p className="font-sans text-[12px] text-bk-muted mt-3">
                Not an organizer yet? <Link href="/organizer/register" className="text-bk-gold-light underline">Register to host</Link>.
              </p>
            )}
          </section>
        );
      })}
    </main>
  );
}
