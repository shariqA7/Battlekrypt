"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Hide a rating from the organizer's average (abuse, wrong event), or bring it back.
export default function HideRatingButton({ ratingId, hidden }: { ratingId: string; hidden: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    let reason: string | undefined;
    if (!hidden) {
      const r = prompt("Why are you hiding this rating? (it is written to the admin log)");
      if (r === null) return;
      reason = r;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/ratings/${ratingId}/hide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: !hidden, reason }),
    });
    setBusy(false);
    if (res.ok) return router.refresh();
    setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
  }

  return (
    <span>
      <button type="button" onClick={toggle} disabled={busy} className="font-sans text-[11px] uppercase tracking-[0.6px] text-bk-gold-light underline disabled:opacity-50">
        {busy ? "…" : hidden ? "Show again" : "Hide"}
      </button>
      {error && <span role="alert" className="text-bk-live text-[11px] ml-2">{error}</span>}
    </span>
  );
}
