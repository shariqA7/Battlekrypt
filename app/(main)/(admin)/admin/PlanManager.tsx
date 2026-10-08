"use client";

import { useState } from "react";

export interface AdminPlan {
  code: string;
  audience: string;
  name: string;
  isPaid: boolean;
  priceAmount: number | null;
  priceCurrency: string | null;
  durationDays: number;
  limits: Record<string, number | boolean | null>;
  isActive: boolean;
}

const CURRENCIES = ["PKR", "USD", "INR", "SAR", "AED"];

// Human labels + input kind for each limit key (mirrors LIMIT_KEYS in
// lib/plans.ts). "limit" fields: empty = unlimited.
const LABELS: Record<string, { label: string; kind: "limit" | "count" | "flag" }> = {
  maxTournamentsPerMonth: { label: "Tournaments / month", kind: "limit" },
  maxGames: { label: "Max games", kind: "limit" },
  maxTemplates: { label: "Saved templates", kind: "limit" },
  advancedAnalytics: { label: "Advanced analytics", kind: "flag" },
  prioritySupport: { label: "Priority support", kind: "flag" },
  maxEntriesPerGame: { label: "Entries per game", kind: "limit" },
  maxPlayersPerTeam: { label: "Players per team", kind: "count" },
  maxSubstitutesPerTeam: { label: "Substitutes per team", kind: "count" },
  canSetCoach: { label: "Can set coach", kind: "flag" },
  merchStore: { label: "Merch store", kind: "flag" },
  enhancedProfile: { label: "Enhanced profile", kind: "flag" },
  priorityRegistration: { label: "Priority registration", kind: "flag" },
  extendedStats: { label: "Extended stats", kind: "flag" },
  maxChallengesPerMonth: { label: "Challenges posted / month", kind: "limit" },
  maxChallengePrizeUsd: { label: "Max challenge prize (USD)", kind: "limit" },
  canJoinChallenges: { label: "Can join challenges", kind: "flag" },
};

const input =
  "bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2 h-[30px]";

function PlanRow({ initial }: { initial: AdminPlan }) {
  const [plan, setPlan] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function setLimit(key: string, value: number | boolean | null) {
    setPlan((p) => ({ ...p, limits: { ...p.limits, [key]: value } }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const body: Record<string, unknown> = {
      name: plan.name,
      durationDays: plan.durationDays,
      limits: plan.limits,
      isActive: plan.isActive,
    };
    if (plan.isPaid) {
      body.priceAmount = plan.priceAmount;
      body.priceCurrency = plan.priceCurrency;
    }
    const res = await fetch(`/api/admin/plans/${plan.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setPlan(await res.json());
      setMsg({ ok: true, text: "Saved." });
    } else {
      const err = await res.json().catch(() => null);
      setMsg({ ok: false, text: err?.error?.message ?? "Couldn't save." });
    }
    setSaving(false);
  }

  return (
    <div className="bg-bk-surface border border-bk-border p-3 mb-2">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input
          className={`${input} w-40`}
          value={plan.name}
          onChange={(e) => setPlan({ ...plan, name: e.target.value })}
          aria-label="Plan name"
        />
        <span className="font-mono text-[11px] text-bk-muted">{plan.code}</span>
        {plan.isPaid && (
          <>
            <input
              type="number"
              min={1}
              className={`${input} w-24`}
              value={plan.priceAmount ?? ""}
              onChange={(e) =>
                setPlan({ ...plan, priceAmount: e.target.value === "" ? null : Number(e.target.value) })
              }
              aria-label="Price"
            />
            <select
              className={input}
              value={plan.priceCurrency ?? "PKR"}
              onChange={(e) => setPlan({ ...plan, priceCurrency: e.target.value })}
              aria-label="Currency"
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              className={`${input} w-16`}
              value={plan.durationDays}
              onChange={(e) => setPlan({ ...plan, durationDays: Number(e.target.value) })}
              aria-label="Duration in days"
            />
            <span className="font-sans text-[11px] text-bk-muted">days</span>
          </>
        )}
        <label className="flex items-center gap-1 font-sans text-[12px] text-bk-body ml-auto">
          <input
            type="checkbox"
            checked={plan.isActive}
            onChange={(e) => setPlan({ ...plan, isActive: e.target.checked })}
          />
          On sale
        </label>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
        {Object.entries(plan.limits).map(([key, value]) => {
          const meta = LABELS[key] ?? { label: key, kind: "count" as const };
          return (
            <label key={key} className="flex items-center justify-between gap-2 font-sans text-[12px] text-bk-body">
              {meta.label}
              {meta.kind === "flag" ? (
                <input
                  type="checkbox"
                  checked={value === true}
                  onChange={(e) => setLimit(key, e.target.checked)}
                />
              ) : (
                <input
                  type="number"
                  min={0}
                  className={`${input} w-20`}
                  value={value === null ? "" : String(value)}
                  placeholder={meta.kind === "limit" ? "∞" : ""}
                  onChange={(e) =>
                    setLimit(key, e.target.value === "" ? (meta.kind === "limit" ? null : 0) : Number(e.target.value))
                  }
                />
              )}
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] uppercase px-3 py-1.5 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save plan"}
        </button>
        {msg && (
          <span className={`font-sans text-xs ${msg.ok ? "text-bk-muted" : "text-bk-live"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

// Edit price, duration, on-sale flag and every limit of each plan. Empty
// number = unlimited (for the limits that allow it). Changes apply
// immediately to everyone on that plan.
export default function PlanManager({ initialPlans }: { initialPlans: AdminPlan[] }) {
  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">Subscription plans</p>
      <p className="font-sans text-bk-muted text-xs mb-3">
        Changes apply immediately to everyone on the plan. Empty limit = unlimited.
      </p>
      {initialPlans.map((p) => (
        <PlanRow key={p.code} initial={p} />
      ))}
    </section>
  );
}
