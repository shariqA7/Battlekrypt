"use client";

import { useState } from "react";

// Payment instructions shown on the plans page + the master ads switch.
export default function PlanSettings({
  initialInstructions,
  initialAdsEnabled,
}: {
  initialInstructions: string;
  initialAdsEnabled: boolean;
}) {
  const [instructions, setInstructions] = useState(initialInstructions);
  const [adsEnabled, setAdsEnabled] = useState(initialAdsEnabled);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function save() {
    setSaving(true);
    setStatus("idle");
    const res = await fetch("/api/admin/plan-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planPaymentInstructions: instructions, adsEnabled }),
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
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5 disabled:opacity-50"
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
