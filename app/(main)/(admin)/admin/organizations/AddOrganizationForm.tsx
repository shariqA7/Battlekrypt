"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import DurationPicker, { DEFAULT_DURATION, toPlanDuration, type DurationChoice } from "@/components/admin/DurationPicker";

interface UserHit {
  id: string;
  name: string;
  email: string;
  organization: string | null;
}
interface PlanOption {
  code: string;
  name: string;
  isPaid: boolean;
}

// Add an organization for someone who already has an account, with no
// application or payment proof, and optionally give it a plan for a chosen period.
export default function AddOrganizationForm({ plans }: { plans: PlanOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [picked, setPicked] = useState<UserHit | null>(null);
  const [orgName, setOrgName] = useState("");
  const [country, setCountry] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [duration, setDuration] = useState<DurationChoice>(DEFAULT_DURATION);
  const [liftLimits, setLiftLimits] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const field = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
  const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1 mt-3";
  const selectedPlan = plans.find((p) => p.code === planCode);
  // Results only show for a long-enough search with nobody picked yet.
  const shownHits = picked || query.trim().length < 2 ? [] : hits;

  useEffect(() => {
    if (picked || query.trim().length < 2) return;
    const t = setTimeout(() => {
      fetch(`/api/admin/organizations/user-search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setHits)
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, picked]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return setError("Choose the account first.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: picked.id,
        orgName,
        country,
        planCode: planCode || undefined,
        duration: selectedPlan?.isPaid ? toPlanDuration(duration) : undefined,
        liftLimits,
      }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    setDone(`${orgName} was added for ${picked.name}.`);
    setPicked(null);
    setQuery("");
    setOrgName("");
    setCountry("");
    setPlanCode("");
    setLiftLimits(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-4 py-2.5"
        >
          Add organization
        </button>
        {done && <span className="font-sans text-[12px] text-bk-teal ml-3">{done}</span>}
      </div>
    );
  }

  return (
    <Panel className="p-4">
      <div className="flex justify-between items-start">
        <p className="font-sans font-bold text-[14px] text-bk-heading">Add an organization</p>
        <button type="button" onClick={() => setOpen(false)} className="font-sans text-[11px] uppercase text-bk-muted underline">
          Close
        </button>
      </div>
      <p className="font-sans text-[12px] text-bk-muted mt-1">
        For someone who already has an account. It skips the application and the payment screenshot. If they don&apos;t have an
        account yet, ask them to sign up first.
      </p>
      <form onSubmit={submit}>
        <label className={label}>Account (name or email)</label>
        {picked ? (
          <div className="flex items-center justify-between border border-bk-border px-3 py-2">
            <span className="font-sans text-[13px] text-bk-heading">
              {picked.name} <span className="text-bk-muted">· {picked.email}</span>
            </span>
            <button type="button" onClick={() => setPicked(null)} className="font-sans text-[11px] uppercase text-bk-gold-light underline">
              Change
            </button>
          </div>
        ) : (
          <>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className={field} />
            {shownHits.length > 0 && (
              <ul className="border border-bk-border mt-1 divide-y divide-bk-border">
                {shownHits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      disabled={!!h.organization}
                      onClick={() => setPicked(h)}
                      className="w-full text-left px-3 py-2 font-sans text-[12px] text-bk-body hover:bg-bk-surface disabled:opacity-50"
                    >
                      <span className="text-bk-heading">{h.name}</span> · {h.email}
                      {h.organization && <span className="text-bk-live"> · already has “{h.organization}”</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <label className={label}>Organization name</label>
        <input required minLength={2} maxLength={60} value={orgName} onChange={(e) => setOrgName(e.target.value)} className={field} />

        <label className={label}>Country (optional)</label>
        <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Pakistan" className={field} />

        <label className={label}>Plan</label>
        <select value={planCode} onChange={(e) => setPlanCode(e.target.value)} className={field}>
          <option value="">Free (default)</option>
          {plans
            .filter((p) => p.isPaid)
            .map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
        </select>
        {selectedPlan?.isPaid && (
          <div className="mt-2">
            <p className="font-sans text-[11px] text-bk-muted mb-1">How long should it last?</p>
            <DurationPicker value={duration} onChange={setDuration} />
            <p className="font-sans text-[11px] text-bk-muted mt-1">
              Given free of charge: no payment is recorded and no security deposit is collected.
            </p>
          </div>
        )}

        <label className="flex items-start gap-2 font-sans text-[12px] text-bk-body mt-3">
          <input type="checkbox" checked={liftLimits} onChange={(e) => setLiftLimits(e.target.checked)} className="mt-0.5" />
          Lift the new-organizer starter limits (for organizers you already trust)
        </label>

        {error && <p className="text-bk-live text-[12px] font-sans mt-3">{error}</p>}
        <button
          type="submit"
          disabled={busy || !picked}
          className="mt-4 bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-5 py-2.5 disabled:opacity-50"
        >
          {busy ? "Adding..." : "Add organization"}
        </button>
      </form>
    </Panel>
  );
}
