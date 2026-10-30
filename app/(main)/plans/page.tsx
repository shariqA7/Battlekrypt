import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPlanStates, getPlanSettings, listPlans } from "@/lib/services/plan-requests";
import { describeLimits, PAID_PERKS } from "@/lib/plan-copy";
import { formatMoney } from "@/lib/money";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import PlanRequestForm from "./PlanRequestForm";
import ChangePlanCard from "./ChangePlanCard";
import { getPlanChangeView } from "@/lib/services/plan-changes";
import DepositRefundButton from "./DepositRefundButton";
import { getDepositDue, getMyDeposits } from "@/lib/services/security-deposits";
import { describeExtras, listPlanFields } from "@/lib/services/plan-fields";
import { hasOpenPlanInvoice } from "@/lib/services/invoices";
import Link from "next/link";

const AUDIENCE_LABEL = { organizer: "Organizer", club: "Club", player: "Player" } as const;

const dateFmt = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function PlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/plans");

  const openInvoice = await hasOpenPlanInvoice(user.id);
  const changeView = await getPlanChangeView(user.id);
  const [states, plans, settings, planFields, myDeposits] = await Promise.all([
    getMyPlanStates(user.id),
    listPlans({ activeOnly: true }),
    getPlanSettings(),
    listPlanFields(),
    getMyDeposits(user.id),
  ]);

  // Refundable deposit still to pay for each organizer plan (0 = none due).
  const depositDue: Record<string, number> = {};
  if (settings.depositEnabled) {
    for (const p of plans) {
      if (p.audience === "organizer" && p.isPaid && p.depositAmount) {
        depositDue[p.code] = await getDepositDue(user.id, {
          audience: p.audience,
          depositAmount: p.depositAmount,
          priceCurrency: p.priceCurrency,
        });
      }
    }
  }

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-2">My plans</h1>
      <p className="font-sans text-bk-body text-[13px] mb-8">
        Paid plans add convenience and remove ads. Joining tournaments, playing and your rating are
        never locked behind a plan.
      </p>

      <p className="font-sans text-[12px] mb-6">
        <Link href="/invoices" className="text-bk-gold-light underline">View my invoices</Link>
      </p>
      {openInvoice && (
        <p className="font-sans text-[13px] text-bk-amber border border-bk-amber/40 p-3 mb-6">
          You have an unpaid invoice for your plan. <Link href="/invoices" className="underline">Open it</Link> to pay — no need to buy the plan here as well.
        </p>
      )}

      {states.length === 0 && (
        <p className="font-sans text-bk-muted text-sm">
          Complete player onboarding, or register as an organizer or club, to see plans for that
          account.
        </p>
      )}

      {states.map((s) => {
        // An organizer on an active paid plan changes plan through the card below (upgrade with credit,
        // downgrade at renewal); the buy forms for other plans would switch plans without any credit.
        const options = plans.filter(
          (p) => p.audience === s.audience && p.isPaid && !(s.audience === "organizer" && changeView && p.code !== s.plan.code)
        );
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

            {s.audience === "organizer" && myDeposits.length > 0 && (
              <div className="bg-bk-surface border border-bk-border p-4 mb-3">
                <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1">
                  Security deposit
                </p>
                {myDeposits.map((d) => (
                  <p key={d.id} className="font-sans text-[13px] text-bk-heading">
                    <span className="font-mono">{formatMoney(Number(d.amount.toString()), d.currency)}</span>{" "}
                    <span className="text-bk-muted">
                      {d.status === "held"
                        ? "· on hold while you host events"
                        : `· refund requested, eligible from ${dateFmt(d.refundEligibleAt ?? new Date())} once all your events and prize payouts are settled`}
                    </span>
                  </p>
                ))}
                {myDeposits.some((d) => d.status === "held") && (
                  <DepositRefundButton refundDays={settings.depositRefundDays} />
                )}
                <p className="font-sans text-[11px] text-bk-muted mt-2">
                  Processing fees and tax paid with your plan are not refundable.
                </p>
              </div>
            )}

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

            {s.audience === "organizer" && changeView && <ChangePlanCard view={changeView} />}

            {options.map((p) => {
              const perks = [...describeLimits(s.audience, p.limits), ...PAID_PERKS];
              const isCurrent = s.plan.code === p.code;
              const extras = describeExtras(
                planFields.filter((f) => f.audience === p.audience),
                p.extras
              );
              const due = depositDue[p.code] ?? 0;
              const showDeposit = settings.depositEnabled && p.depositAmount && p.priceCurrency;
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
                      {showDeposit && (
                        <p className="font-sans text-[12px] text-bk-body mt-1">
                          + refundable security deposit{" "}
                          <span className="font-mono text-bk-heading">
                            {formatMoney(p.depositAmount!, p.priceCurrency!)}
                          </span>
                          {due === 0 && <span className="text-bk-muted"> (already on hold)</span>}
                        </p>
                      )}
                    </div>
                    {!s.pendingRequest && (
                      <PlanRequestForm
                        audience={s.audience}
                        planCode={p.code}
                        planName={isCurrent ? "renewal" : p.name}
                        paymentInstructions={settings.planPaymentInstructions}
                        breakdown={
                          p.priceAmount !== null && p.priceCurrency
                            ? {
                                price: formatMoney(p.priceAmount, p.priceCurrency),
                                deposit: due > 0 ? formatMoney(due, p.priceCurrency) : null,
                                total: formatMoney(p.priceAmount + due, p.priceCurrency),
                                refundDays: settings.depositRefundDays,
                              }
                            : null
                        }
                      />
                    )}
                  </div>
                  <ul className="mt-3 font-sans text-[13px] text-bk-body list-disc pl-5 space-y-0.5">
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
                </div>
              );
            })}
          </section>
        );
      })}
    </main>
  );
}
