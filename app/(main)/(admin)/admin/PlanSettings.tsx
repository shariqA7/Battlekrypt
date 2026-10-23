"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";

// Payment instructions shown on the plans page + the master ads switch.
export default function PlanSettings({
  initialInstructions,
  initialAdsEnabled,
  initialDepositEnabled,
  initialDepositRefundDays,
  initialDepositMultiplier,
}: {
  initialInstructions: string;
  initialAdsEnabled: boolean;
  initialDepositEnabled: boolean;
  initialDepositRefundDays: number;
  initialDepositMultiplier: number;
}) {
  const [instructions, setInstructions] = useState(initialInstructions);
  const [adsEnabled, setAdsEnabled] = useState(initialAdsEnabled);
  const [depositEnabled, setDepositEnabled] = useState(initialDepositEnabled);
  const [refundDays, setRefundDays] = useState(String(initialDepositRefundDays));
  const [multiplier, setMultiplier] = useState(String(initialDepositMultiplier));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function save() {
    setSaving(true);
    setStatus("idle");
    const res = await fetch("/api/admin/plan-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planPaymentInstructions: instructions,
        adsEnabled,
        depositEnabled,
        depositRefundDays: Number(refundDays),
        depositExposureMultiplier: Number(multiplier),
      }),
    });
    setStatus(res.ok ? "saved" : "error");
    setSaving(false);
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-3">
        Plan payments &amp; ads
      </p>
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={3}
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 mb-2"
        placeholder="Send the plan price to JazzCash 03XX-XXXXXXX, then upload the screenshot."
      />
      <label className="flex items-center gap-2 font-sans text-[13px] text-bk-body mb-3">
        <input
          type="checkbox"
          checked={adsEnabled}
          onChange={(e) => setAdsEnabled(e.target.checked)}
        />
        Show ad slots to free-plan accounts
      </label>

      <div className="border border-bk-border p-3 mb-3">
        <label className="flex items-center gap-2 font-sans text-[13px] text-bk-heading mb-1">
          <input
            type="checkbox"
            checked={depositEnabled}
            onChange={(e) => setDepositEnabled(e.target.checked)}
          />
          Security deposit on organizer plans
        </label>
        <p className="font-sans text-[11px] text-bk-muted mb-3">
          On: the deposit shows on plans and is required on new purchases (set the amount on each paid
          organizer plan). Off: it is hidden and not asked for. Deposits already held keep their effect and
          stay refundable either way.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-1">
              Refund wait (days)
            </span>
            <input
              type="number"
              min={1}
              max={365}
              value={refundDays}
              onChange={(e) => setRefundDays(e.target.value)}
              className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]"
            />
          </label>
          <label className="block">
            <span className="block font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-1">
              Events can total (× deposit)
            </span>
            <input
              type="number"
              min={1}
              max={100}
              step="0.5"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]"
            />
          </label>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={buttonClass("primary", "sm", "")}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {status === "saved" && <span className="font-sans text-xs text-bk-muted">Saved.</span>}
        {status === "error" && (
          <span className="font-sans text-xs text-bk-live">Couldn&apos;t save.</span>
        )}
      </div>
    </section>
  );
}
