"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Per-organization switch: create a renewal invoice automatically before the paid plan ends.
export default function AutoRenewToggle({ organizerId, initial, hasPaidPlan }: { organizerId: string; initial: boolean; hasPaidPlan: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip(next: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/organizations/${organizerId}/auto-renew`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoRenew: next }),
    });
    setBusy(false);
    if (!res.ok) return setError("Could not change it.");
    setOn(next);
    router.refresh();
  }

  return (
    <div className="font-sans text-[12px]">
      <label className="flex items-center gap-2 text-bk-heading cursor-pointer">
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => flip(e.target.checked)} />
        Renew the plan automatically
      </label>
      <p className="text-bk-muted text-[11px] mt-0.5 pl-6">
        {hasPaidPlan ? "A renewal invoice is created before the plan ends." : "Applies once they are on a paid plan."}
      </p>
      {error && <p className="text-bk-live text-[11px] pl-6">{error}</p>}
    </div>
  );
}
