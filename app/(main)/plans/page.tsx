import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPlanStates, getPlanSettings, listPlans } from "@/lib/services/plan-requests";
import { describeLimits, PAID_PERKS } from "@/lib/plan-copy";
import { formatMoney } from "@/lib/money";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import PlanRequestForm from "./PlanRequestForm";

const AUDIENCE_LABEL = { organizer: "Organizer", club: "Club", player: "Player" } as const;

const dateFmt = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function PlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/plans");

  const [states, plans, settings] = await Promise.all([
    getMyPlanStates(user.id),
    listPlans({ activeOnly: true }),
    getPlanSettings(),
  ]);

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-2">My plans</h1>
      <p className="font-sans text-bk-body text-[13px] mb-8">
        Paid plans add convenience and remove ads. Joining tournaments, playing and your rating are
        never locked behind a plan.
      </p>

      {states.length === 0 && (
        <p className="font-sans text-bk-muted text-sm">
          Complete player onboarding, or register as an organizer or club, to see plans for that
          account.
        </p>
      )}

      {states.map((s) => {
        const options = plans.filter((p) => p.audience === s.audience && p.isPaid);
        return (
          <section key={s.audience} className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-sans font-bold text-lg text-bk-heading">
                {AUDIENCE_LABEL[s.audience]} account
              </h2>
              {s.verified && <VerifiedBadge size={16} />}
            </div>

            <div className="bg-bk-surface border border-bk-border p-4 mb-3">
              <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1">
                Current plan
              </p>
              <p className="font-sans font-medium text-bk-heading text-sm">
                {s.plan.name}
                {s.plan.isPaid && s.plan.expiresAt && (
                  <span className="text-bk-muted font-normal">
                    {" "}
                    · active until {dateFmt(s.plan.expiresAt)}
                  </span>
                )}
                {s.plan.isPaid && !s.plan.expiresAt && (
                  <span className="text-bk-muted font-normal"> · no expiry</span>
                )}
              </p>
              {s.plan.expired && (
                <p className="font-sans text-[12px] text-bk-live mt-1">
                  Your paid plan has expired — you&apos;re back on the free plan. Nothing you created
                  was deleted.
                </p>
              )}
              {s.plan.isPaid && !s.verified && s.audience !== "player" && (
                <p className="font-sans text-[12px] text-bk-muted mt-1">
                  The Verified badge also needs your{" "}
                  {s.audience === "organizer" ? "organizer approval" : "club approval"} to be
                  complete.
                </p>
              )}
            </div>

            {s.pendingRequest && (
              <p className="font-sans text-[12px] text-amber-400 mb-3">
                Your request for{" "}
                {plans.find((p) => p.code === s.pendingRequest!.planCode)?.name ??
                  s.pendingRequest.planCode}{" "}
                is waiting for admin review.
              </p>
            )}
            {s.lastRejection && (
              <p className="font-sans text-[12px] text-bk-live mb-3">
                Your last plan request was declined
                {s.lastRejection.note ? `: ${s.lastRejection.note}` : "."}
              </p>
            )}

            {options.map((p) => {
              const perks = [...describeLimits(s.audience, p.limits), ...PAID_PERKS];
              const isCurrent = s.plan.code === p.code;
              return (
                <div key={p.code} className="bg-bk-surface border border-bk-border p-4 mb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-sans font-bold text-bk-heading text-[15px]">{p.name}</p>
                      {p.priceAmount !== null && p.priceCurrency && (
                        <p className="font-mono text-bk-gold-light text-sm mt-0.5">
                          {formatMoney(p.priceAmount, p.priceCurrency)}{" "}
                          <span className="text-bk-muted">/ {p.durationDays} days</span>
                        </p>
                      )}
                    </div>
                    {!s.pendingRequest && (
                      <PlanRequestForm
                        audience={s.audience}
                        planCode={p.code}
                        planName={isCurrent ? "renewal" : p.name}
                        paymentInstructions={settings.planPaymentInstructions}
                      />
                    )}
                  </div>
                  <ul className="mt-3 font-sans text-[13px] text-bk-body list-disc pl-5 space-y-0.5">
                    {perks.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        );
      })}
    </main>
  );
}
