"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";

export interface AdminPlan {
  code: string;
  audience: string;
  name: string;
  isPaid: boolean;
  priceAmount: number | null;
  priceCurrency: string | null;
  durationDays: number;
  limits: Record<string, number | boolean | null>;
  depositAmount: number | null;
  extras: Record<string, string | number | boolean>;
  isActive: boolean;
}

export interface AdminPlanField {
  id: string;
  audience: string;
  label: string;
  kind: string; // "text" | "number" | "flag"
}

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

// `currencies` are the ones switched on in /admin/currencies; a plan already priced in
// another currency keeps it in the list so saving never silently changes it.
function PlanRow({
  initial,
  fields,
  depositEnabled,
  currencies,
}: {
  initial: AdminPlan;
  fields: AdminPlanField[];
  depositEnabled: boolean;
  currencies: string[];
}) {
  const [plan, setPlan] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function setLimit(key: string, value: number | boolean | null) {
    setPlan((p) => ({ ...p, limits: { ...p.limits, [key]: value } }));
  }

  function setExtra(id: string, value: string | number | boolean | null) {
    setPlan((p) => {
      const next = { ...p.extras };
      if (value === null || value === "") delete next[id];
      else next[id] = value;
      return { ...p, extras: next };
    });
  }

  const canHaveDeposit = plan.audience === "organizer" && plan.isPaid;

  async function save() {
    setSaving(true);
    setMsg(null);
    const body: Record<string, unknown> = {
      name: plan.name,
      durationDays: plan.durationDays,
      limits: plan.limits,
      extras: plan.extras,
      isActive: plan.isActive,
    };
    if (canHaveDeposit) body.depositAmount = plan.depositAmount;
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
              {(initial.priceCurrency && !currencies.includes(initial.priceCurrency) ? [...currencies, initial.priceCurrency] : currencies).map((c) => (
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

      {canHaveDeposit && (
        <div className="border-t border-bk-border pt-3 mb-3">
          <label className="flex flex-wrap items-center gap-2 font-sans text-[12px] text-bk-body">
            Refundable security deposit
            <input
              type="number"
              min={0}
              className={`${input} w-28`}
              value={plan.depositAmount ?? ""}
              placeholder="none"
              onChange={(e) =>
                setPlan({ ...plan, depositAmount: e.target.value === "" ? null : Number(e.target.value) })
              }
              aria-label="Security deposit amount"
            />
            <span className="text-bk-muted">{plan.priceCurrency ?? "PKR"}</span>
            {!depositEnabled && (
              <span className="text-bk-amber text-[11px]">
                Deposits are switched off in Settings, so this isn&apos;t shown or asked for yet.
              </span>
            )}
          </label>
          <p className="font-sans text-[11px] text-bk-muted mt-1">
            Paid once on top of the plan price. Refundable when the organizer leaves the plan; fees and tax never are.
          </p>
        </div>
      )}

      {fields.length > 0 && (
        <div className="border-t border-bk-border pt-3 mb-3">
          <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-2">
            Custom fields (shown on the plans page)
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {fields.map((f) => (
              <label key={f.id} className="flex items-center justify-between gap-2 font-sans text-[12px] text-bk-body">
                {f.label}
                {f.kind === "flag" ? (
                  <input
                    type="checkbox"
                    checked={plan.extras[f.id] === true}
                    onChange={(e) => setExtra(f.id, e.target.checked ? true : null)}
                  />
                ) : f.kind === "number" ? (
                  <input
                    type="number"
                    className={`${input} w-28`}
                    value={typeof plan.extras[f.id] === "number" ? String(plan.extras[f.id]) : ""}
                    onChange={(e) => setExtra(f.id, e.target.value === "" ? null : Number(e.target.value))}
                  />
                ) : (
                  <input
                    type="text"
                    maxLength={200}
                    className={`${input} w-40`}
                    value={typeof plan.extras[f.id] === "string" ? String(plan.extras[f.id]) : ""}
                    onChange={(e) => setExtra(f.id, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={buttonClass("primary", "sm", "")}
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

function FieldManager({ fields }: { fields: AdminPlanField[] }) {
  const router = useRouter();
  const [audience, setAudience] = useState("organizer");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("text");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/plan-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience, label, kind }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Couldn't add.");
    setLabel("");
    router.refresh();
  }

  async function remove(f: AdminPlanField) {
    if (!confirm(`Delete "${f.label}"? Its value is removed from every ${f.audience} plan.`)) return;
    const res = await fetch(`/api/admin/plan-fields/${f.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setError("Couldn't delete.");
  }

  return (
    <section className="mb-6">
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">Custom plan fields</p>
      <p className="font-sans text-bk-muted text-xs mb-3">
        Extra rows you can fill in on each plan and show on the plans page. They are descriptive only — they don&apos;t
        change what an account can do. Deleting a field removes it from every plan.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select className={input} value={audience} onChange={(e) => setAudience(e.target.value)} aria-label="Account type">
          <option value="organizer">Organizer</option>
          <option value="club">Club</option>
          <option value="player">Player</option>
        </select>
        <input
          className={`${input} w-48`}
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Dedicated manager"
          aria-label="Field name"
        />
        <select className={input} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Field type">
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="flag">Yes / no</option>
        </select>
        <button type="button" onClick={add} disabled={busy || label.trim().length < 2} className={buttonClass("primary", "sm", "")}>
          Add field
        </button>
      </div>
      {error && <p className="font-sans text-xs text-bk-live mb-2">{error}</p>}
      {fields.length === 0 ? (
        <p className="font-sans text-xs text-bk-muted">No custom fields yet.</p>
      ) : (
        <ul className="space-y-1">
          {fields.map((f) => (
            <li key={f.id} className="flex items-center justify-between font-sans text-[12px] text-bk-body border border-bk-border px-3 py-1.5">
              <span>
                <span className="text-bk-heading">{f.label}</span> · {f.audience} · {f.kind === "flag" ? "yes / no" : f.kind}
              </span>
              <button type="button" onClick={() => remove(f)} className="text-bk-live uppercase tracking-[0.8px] text-[11px]">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Edit price, duration, on-sale flag, deposit and every limit of each plan.
// Empty number = unlimited (for the limits that allow it). Changes apply
// immediately to everyone on that plan.
export default function PlanManager({
  initialPlans,
  fields,
  depositEnabled,
  currencies,
}: {
  initialPlans: AdminPlan[];
  fields: AdminPlanField[];
  depositEnabled: boolean;
  currencies: string[];
}) {
  return (
    <div>
      <FieldManager fields={fields} />
      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-1">Subscription plans</p>
        <p className="font-sans text-bk-muted text-xs mb-3">
          Changes apply immediately to everyone on the plan. Empty limit = unlimited.
        </p>
        {initialPlans.map((p) => (
          <PlanRow
            key={p.code}
            initial={p}
            fields={fields.filter((f) => f.audience === p.audience)}
            depositEnabled={depositEnabled}
            currencies={currencies}
          />
        ))}
      </section>
    </div>
  );
}
