"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import type { ChangePreview } from "@/lib/services/plan-changes";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export type PlanChangeView = {
  currentName: string;
  expiresAt: string | null;
  autoRenew: boolean;
  pending: { name: string; on: string | null } | null;
  scheduled: { name: string; on: string } | null;
  blockedMessage: string | null;
  options: ChangePreview[];
};

// "Change my plan": upgrade now (with credit for the unused time) or move to a lower plan when
// the current period ends.
export default function ChangePlanCard({ view }: { view: PlanChangeView }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, key: string, body?: object) {
    setBusy(key);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error?.message ?? "Something went wrong.");
    if (data.kind === "upgrade" && data.invoiceId) return router.push(`/invoices/${data.invoiceId}`);
    router.refresh();
  }

  function choose(o: ChangePreview) {
    const msg =
      o.kind === "upgrade"
        ? `Upgrade to ${o.targetName}? An invoice for ${formatMoney(o.total, o.currency)} will be created. The new plan starts when it is paid.`
        : `Move to ${o.targetName} when your ${view.currentName} plan ends${view.expiresAt ? ` on ${day(view.expiresAt)}` : ""}? You keep ${view.currentName} until then.`;
    if (confirm(msg)) void call("/api/plans/change", o.targetCode, { planCode: o.targetCode });
  }

  return (
    <div className="bg-bk-surface border border-bk-border p-4 mb-3">
      <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-2">Change my plan</p>

      {view.scheduled && (
        <p className="font-sans text-[13px] text-bk-teal mb-2">
          {view.scheduled.name} is paid for and starts on {day(view.scheduled.on)}, when {view.currentName} ends.
        </p>
      )}
      {view.pending && (
        <div className="font-sans text-[13px] text-bk-amber border border-bk-amber/40 p-3 mb-3">
          You&apos;re moving to {view.pending.name}{view.pending.on ? ` on ${day(view.pending.on)}` : ""}. You keep {view.currentName} until then.{" "}
          <button type="button" disabled={busy !== null} onClick={() => call("/api/plans/change/undo", "undo")} className="underline">
            {busy === "undo" ? "…" : "Undo"}
          </button>
        </div>
      )}
      {!view.autoRenew && !view.pending && (
        <p className="font-sans text-[12px] text-bk-muted mb-2">
          Renewal is off: {view.currentName} ends{view.expiresAt ? ` on ${day(view.expiresAt)}` : ""} and you go back to the free plan.
        </p>
      )}

      {view.blockedMessage ? (
        <p className="font-sans text-[12px] text-bk-muted">{view.blockedMessage}</p>
      ) : (
        <ul className="space-y-2">
          {view.options.map((o) => (
            <li key={o.targetCode} className="bg-bk-bg border border-bk-border p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="font-sans text-[12px] min-w-0">
                <p className="text-[13px] text-bk-heading font-medium">
                  {o.kind === "upgrade" ? "Upgrade to" : "Move down to"} {o.targetName}
                  <span className="text-bk-muted font-normal"> · {formatMoney(o.planFee, o.currency)}</span>
                </p>
                {o.kind === "upgrade" ? (
                  <p className="text-bk-muted">
                    Starts when paid. {o.credit > 0 ? `Credit for ${o.remainingDays} unused days: − ${formatMoney(o.credit, o.currency)}. ` : ""}
                    {o.securityFee > 0 ? `Extra refundable security fee: ${formatMoney(o.securityFee, o.currency)}. ` : ""}
                    {o.tax > 0 ? `${o.taxLabel}: ${formatMoney(o.tax, o.currency)}. ` : ""}
                    <span className="text-bk-heading">To pay: {formatMoney(o.total, o.currency)}</span>
                  </p>
                ) : (
                  <p className="text-bk-muted">Nothing to pay now. You keep {view.currentName} until it ends{o.effectiveOn ? ` on ${day(o.effectiveOn)}` : ""}; the next renewal is for {o.targetName}.</p>
                )}
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => choose(o)}
                className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50"
              >
                {busy === o.targetCode ? "…" : o.kind === "upgrade" ? "Upgrade" : "Switch at renewal"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {view.autoRenew && !view.pending && !view.blockedMessage && view.expiresAt && (
        <p className="font-sans text-[11px] text-bk-muted mt-3">
          Don&apos;t want to renew?{" "}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => confirm(`Stop renewing? ${view.currentName} will end on ${day(view.expiresAt!)} and you'll go back to the free plan.`) && call("/api/plans/change/stop", "stop")}
            className="underline"
          >
            Stop renewing
          </button>
        </p>
      )}
      {error && <p role="alert" className="font-sans text-[12px] text-bk-live mt-2">{error}</p>}
    </div>
  );
}
