"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "Move me to the next session" or "Refund me" for a paid entry in a cancelled session.
export default function ChoiceButtons({ registrationId, next }: { registrationId: string; next: { name: string; when: string } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(choice: "next" | "refund") {
    if (choice === "refund" && !confirm("Ask for a refund? The organizer will send the money back to you directly.")) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/bookings/choice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registrationId, choice }) });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    router.refresh();
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {next
          ? <button disabled={busy} onClick={() => choose("next")} className="bg-white text-bk-bg font-sans font-bold text-[11px] uppercase tracking-[0.8px] px-4 h-[36px] disabled:opacity-50">Move me to {next.name} ({next.when})</button>
          : <span className="font-sans text-[12px] text-bk-muted self-center">There is no later session to move to.</span>}
        <button disabled={busy} onClick={() => choose("refund")} className="border border-bk-border text-bk-heading font-sans text-[11px] uppercase tracking-[0.8px] px-4 h-[36px] disabled:opacity-50">Refund me</button>
      </div>
      {error && <p className="text-bk-live text-[12px] font-sans mt-2" role="alert">{error}</p>}
    </div>
  );
}
