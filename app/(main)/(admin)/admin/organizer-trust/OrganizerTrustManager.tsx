"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";

interface Config {
  starterMaxEntryFeeUsd: number;
  starterMaxPrizeUsd: number;
  starterMaxPaidEntrants: number;
  graduationEvents: number;
  payoutGraceDays: number;
  idRetentionDays: number;
  idRejectedRetentionDays: number;
  idValidityMonths: number;
}
interface Props {
  config: Config;
  holds: { id: string; orgName: string; email: string; items: { name: string; reason: string }[] }[];
  disputed: { id: string; tournament: string; organizer: string; organizerUserId: string; winner: string; amount: string; note: string | null }[];
  organizers: { id: string; orgName: string; email: string; limitsLifted: boolean }[];
}

const FIELDS: { key: keyof Config; label: string; hint: string }[] = [
  { key: "starterMaxEntryFeeUsd", label: "Max entry fee (USD)", hint: "Per entry, converted live" },
  { key: "starterMaxPrizeUsd", label: "Max prize pool (USD)", hint: "Per event" },
  { key: "starterMaxPaidEntrants", label: "Max paid entrants", hint: "Capacity of a paid event" },
  { key: "graduationEvents", label: "Events to graduate", hint: "Prize events with every winner confirming" },
  { key: "payoutGraceDays", label: "Payout grace (days)", hint: "Before an unpaid or disputed payout blocks new events" },
  { key: "idRetentionDays", label: "Keep ID images after approval (days)", hint: "Then they are deleted automatically" },
  { key: "idRejectedRetentionDays", label: "Keep ID images after rejection (days)", hint: "Then they are deleted automatically" },
  { key: "idValidityMonths", label: "Identity check valid for (months)", hint: "After that the organizer verifies again" },
];

export default function OrganizerTrustManager({ config, holds, disputed, organizers }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v)]))
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const input = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";

  async function call(url: string, method: string, body: object) {
    setError(null);
    setMsg(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/api/admin/organizer-trust", "PUT", Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])))) {
      setMsg("Saved.");
    }
  }

  return (
    <div className="space-y-6">
      <Panel className="p-4">
        <h2 className="font-sans font-bold text-[14px] text-bk-heading mb-3">Starter limits &amp; ID retention</h2>
        <form onSubmit={saveConfig} className="grid sm:grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1">{f.label}</span>
              <input
                type="number"
                min={0}
                step={f.key.endsWith("Usd") ? "0.01" : "1"}
                value={values[f.key]}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                className={input}
              />
              <span className="font-sans text-[11px] text-bk-muted">{f.hint}</span>
            </label>
          ))}
          <div className="sm:col-span-2">
            <button type="submit" className="bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-5 py-2.5">
              Save limits
            </button>
            {msg && <span className="font-sans text-[12px] text-bk-teal ml-3">{msg}</span>}
          </div>
        </form>
      </Panel>

      {error && <p className="text-bk-live text-[12px] font-sans">{error}</p>}

      <Panel className="p-4">
        <h2 className="font-sans font-bold text-[14px] text-bk-heading mb-3">Disputed prize payouts ({disputed.length})</h2>
        {disputed.length === 0 ? (
          <p className="font-sans text-[13px] text-bk-muted">None.</p>
        ) : (
          <div className="space-y-4">
            {disputed.map((d) => (
              <div key={d.id} className="border border-bk-border p-3">
                <p className="font-sans text-[13px] text-bk-heading font-bold">{d.tournament}</p>
                <p className="font-sans text-[12px] text-bk-body">
                  {d.winner} says {d.organizer} didn&apos;t pay {d.amount}.
                </p>
                {d.note && <p className="font-sans text-[12px] text-bk-muted mt-1 whitespace-pre-wrap">{d.note}</p>}
                <textarea
                  rows={2}
                  value={notes[d.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })}
                  placeholder="Decision note (required to mark settled)"
                  className="w-full mt-2 bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2 py-1.5"
                />
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <button
                    disabled={!(notes[d.id] ?? "").trim()}
                    onClick={() => call(`/api/admin/payouts/${d.id}/settle`, "POST", { note: notes[d.id] })}
                    className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50"
                  >
                    Mark settled
                  </button>
                  <span className="font-sans text-[11px] text-bk-muted">
                    If the organizer didn&apos;t pay, leave it disputed (they stay on hold) and ban from Users.
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="p-4">
        <h2 className="font-sans font-bold text-[14px] text-bk-heading mb-3">Organizers on payout hold ({holds.length})</h2>
        {holds.length === 0 ? (
          <p className="font-sans text-[13px] text-bk-muted">None.</p>
        ) : (
          <ul className="space-y-2">
            {holds.map((h) => (
              <li key={h.id} className="font-sans text-[12px] text-bk-body">
                <span className="text-bk-heading">{h.orgName}</span> ({h.email}):{" "}
                {h.items.map((i) => `${i.name} (${i.reason === "disputed" ? "disputed" : i.reason === "refunds_not_confirmed" ? "refunds not confirmed" : "not marked paid"})`).join(", ")}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="p-4">
        <h2 className="font-sans font-bold text-[14px] text-bk-heading mb-1">Lift starter limits</h2>
        <p className="font-sans text-[12px] text-bk-muted mb-3">
          For organizers you trust already. This does not lift a payout hold. Showing the 100 newest.
        </p>
        <ul className="divide-y divide-bk-border">
          {organizers.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2">
              <span className="font-sans text-[12px] text-bk-body">
                <span className="text-bk-heading">{o.orgName}</span> · {o.email}
              </span>
              <button
                onClick={() => call(`/api/admin/organizers/${o.id}/limits`, "POST", { lifted: !o.limitsLifted })}
                className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-gold-light underline shrink-0"
              >
                {o.limitsLifted ? "Restore limits" : "Lift limits"}
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
