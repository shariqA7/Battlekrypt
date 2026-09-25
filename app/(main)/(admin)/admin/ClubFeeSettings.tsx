"use client";

import { useState } from "react";

// Admin-editable text shown on the club registration form: how much the
// registration fee is and where to send it.
export default function ClubFeeSettings({
  initialInstructions,
}: {
  initialInstructions: string;
}) {
  const [value, setValue] = useState(initialInstructions);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    const res = await fetch("/api/admin/club-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubPaymentInstructions: value }),
    });
    setStatus(res.ok ? "saved" : "error");
    setSaving(false);
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-3">
        Club registration payment instructions
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 mb-2"
        placeholder="Registration fee: Rs 2,000. Send to JazzCash 03XX-XXXXXXX, then upload the screenshot."
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {status === "saved" && (
          <span className="font-sans text-xs text-bk-muted">Saved.</span>
        )}
        {status === "error" && (
          <span className="font-sans text-xs text-bk-live">Couldn&apos;t save.</span>
        )}
      </div>
    </section>
  );
}
