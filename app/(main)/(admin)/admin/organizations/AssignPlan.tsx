"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DurationPicker, { DEFAULT_DURATION, toPlanDuration, type DurationChoice } from "@/components/admin/DurationPicker";

interface PlanOption {
  code: string;
  name: string;
  isPaid: boolean;
}

// Per-row control: give this organization a plan for a chosen period.
export default function AssignPlan({
  organizerId,
  currentPlan,
  plans,
}: {
  organizerId: string;
  currentPlan: string;
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [planCode, setPlanCode] = useState(currentPlan);
  const [duration, setDuration] = useState<DurationChoice>(DEFAULT_DURATION);
  const [extend, setExtend] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = "bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2 h-[34px]";
  const plan = plans.find((p) => p.code === planCode);

  async function save() {
    if (plan && !plan.isPaid && !confirm(`Move this organization to ${plan.name}? Any paid plan it has now ends immediately.`)) return;
    if (duration.choice === "permanent" && plan?.isPaid && !confirm("Give this plan with no expiry date?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/organizations/${organizerId}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode, duration: plan?.isPaid ? toPlanDuration(duration) : undefined, extend, note }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-gold-light underline">
        Assign plan
      </button>
    );
  }

  return (
    <div className="space-y-2 min-w-[260px]">
      <select value={planCode} onChange={(e) => setPlanCode(e.target.value)} className={`${field} w-full`} aria-label="Plan">
        {plans.map((p) => (
          <option key={p.code} value={p.code}>
            {p.name}
          </option>
        ))}
      </select>
      {plan?.isPaid && (
        <>
          <DurationPicker value={duration} onChange={setDuration} />
          <label className="flex items-center gap-2 font-sans text-[11px] text-bk-body">
            <input type="checkbox" checked={extend} onChange={(e) => setExtend(e.target.checked)} />
            If it&apos;s already on this plan, add to the time it has left
          </label>
        </>
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional, kept in the admin log)" className={`${field} w-full`} />
      {error && <p className="font-sans text-[11px] text-bk-live">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-3 py-1.5 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="font-sans text-[11px] uppercase text-bk-muted underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
