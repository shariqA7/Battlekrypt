"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AdminClaim {
  id: string;
  clubName: string;
  explanation: string;
  evidenceUrl: string | null;
  createdAt: string;
  claimant: { email: string | null; displayName: string };
  club: {
    clubName: string;
    status: string;
    createdAt: string;
    owner: { email: string | null; displayName: string };
  } | null;
}

export interface AdminBan {
  id: string;
  reason: string;
  endsAt: string | null;
  user: { email: string | null; displayName: string };
}

const DURATIONS: { label: string; days: number | null | "custom" }[] = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "Permanent", days: null },
  { label: "Custom…", days: "custom" },
];

export default function NameClaims({
  initialClaims,
  initialBans,
}: {
  initialClaims: AdminClaim[];
  initialBans: AdminBan[];
}) {
  const router = useRouter();
  const [claims, setClaims] = useState(initialClaims);
  const [bans, setBans] = useState(initialBans);
  const [open, setOpen] = useState<string | null>(null);
  const [duration, setDuration] = useState("7");
  const [customDays, setCustomDays] = useState("14");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function banDays(): number | null | undefined {
    if (duration === "permanent") return null;
    if (duration === "custom") {
      const n = Number(customDays);
      return Number.isInteger(n) && n >= 1 ? n : undefined;
    }
    return Number(duration);
  }

  async function decide(id: string, action: "uphold" | "dismiss") {
    setError(null);
    let body: Record<string, unknown>;
    if (action === "uphold") {
      const days = banDays();
      if (days === undefined) return setError("Enter a valid number of days.");
      body = { banDays: days, note };
    } else {
      body = { note };
    }
    setBusy(true);
    const res = await fetch(`/api/admin/club-name-claims/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError((await res.json()).error.message);
    } else {
      setClaims((c) => c.filter((x) => x.id !== id));
      setOpen(null);
      setNote("");
      router.refresh();
    }
    setBusy(false);
  }

  async function lift(id: string) {
    const res = await fetch(`/api/admin/bans/${id}/lift`, { method: "POST" });
    if (res.ok) setBans((b) => b.filter((x) => x.id !== id));
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-3">
        Club name claims ({claims.length})
      </p>
      {error && <p className="font-sans text-[12px] text-bk-live mb-3">{error}</p>}
      {claims.length === 0 && <p className="font-sans text-[13px] text-bk-muted">No claims waiting.</p>}

      <div className="space-y-4">
        {claims.map((c) => (
          <div key={c.id} className="bg-bk-surface border border-bk-border p-4">
            <p className="font-sans font-bold text-bk-heading">
              &ldquo;{c.clubName}&rdquo;
            </p>
            <p className="font-sans text-[12px] text-bk-muted mb-3">
              Claimed by {c.claimant.displayName} ({c.claimant.email}) · {new Date(c.createdAt).toLocaleString()}
            </p>
            <p className="font-sans text-[13px] text-bk-body whitespace-pre-wrap mb-2">{c.explanation}</p>
            {c.evidenceUrl && (
              <a href={c.evidenceUrl} target="_blank" rel="noopener noreferrer" className="font-sans text-[12px] text-bk-gold-light underline">
                Proof link
              </a>
            )}
            <div className="mt-3 bg-bk-bg border border-bk-border px-3 py-2 font-sans text-[12px] text-bk-body">
              {c.club ? (
                <>
                  Club holding the name: <b>{c.club.clubName}</b> ({c.club.status}) — owner{" "}
                  {c.club.owner.displayName} ({c.club.owner.email}), created{" "}
                  {new Date(c.club.createdAt).toLocaleDateString()}
                </>
              ) : (
                "The club that held this name no longer exists."
              )}
            </div>

            {open === c.id ? (
              <div className="mt-3">
                <label className="block font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-1">
                  Ban the club owner for
                </label>
                <div className="flex gap-2 mb-2">
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-2 h-[34px]"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d.label} value={d.days === null ? "permanent" : String(d.days)}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  {duration === "custom" && (
                    <input
                      type="number"
                      min={1}
                      value={customDays}
                      onChange={(e) => setCustomDays(e.target.value)}
                      className="w-24 bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-2 h-[34px]"
                    />
                  )}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Note (required to dismiss, optional to uphold)"
                  className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 mb-2"
                />
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => decide(c.id, "uphold")} className="bg-bk-live text-white font-sans font-bold text-[11px] uppercase tracking-[0.5px] px-3 py-1.5 disabled:opacity-50">
                    Disband club &amp; ban owner
                  </button>
                  <button disabled={busy} onClick={() => decide(c.id, "dismiss")} className="border border-bk-border text-bk-heading font-sans font-bold text-[11px] uppercase tracking-[0.5px] px-3 py-1.5 disabled:opacity-50">
                    Dismiss claim
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setOpen(c.id); setError(null); }} className="mt-3 bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] uppercase tracking-[0.5px] px-3 py-1.5">
                Review
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="font-sans font-medium text-bk-heading text-sm mt-8 mb-3">
        Active bans ({bans.length})
      </p>
      {bans.length === 0 ? (
        <p className="font-sans text-[13px] text-bk-muted">No one is banned.</p>
      ) : (
        <ul className="border border-bk-border divide-y divide-bk-border">
          {bans.map((b) => (
            <li key={b.id} className="px-4 py-3 flex justify-between gap-3">
              <div>
                <p className="font-sans text-[13px] text-bk-heading">
                  {b.user.displayName} <span className="text-bk-muted">({b.user.email})</span>
                </p>
                <p className="font-sans text-[12px] text-bk-muted">
                  {b.endsAt ? `Until ${new Date(b.endsAt).toLocaleString()}` : "Permanent"} · {b.reason}
                </p>
              </div>
              <button onClick={() => lift(b.id)} className="font-sans text-[12px] text-bk-gold-light underline shrink-0">
                Lift ban
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
