"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AdminDispute {
  id: string;
  kind: "proof" | "payment";
  status: "awaiting_response" | "awaiting_admin";
  missedDeadline: boolean;
  reason: string;
  openerEvidenceUrls: string[];
  responderNote: string | null;
  responderEvidenceUrls: string[];
  responseDueAt: string;
  createdAt: string;
  openedByPoster: boolean;
  challengeId: string;
  challengeTitle: string;
  prizeLabel: string;
  posterName: string;
  posterEmail: string | null;
  challengerName: string;
  challengerEmail: string | null;
  matchId: string | null;
  proofUrls: string[];
  proofNote: string | null;
  receiptUrls: string[];
  payoutDetails: string | null;
  paymentNote: string | null;
}

const BANS = [
  { value: "none", label: "No ban" },
  { value: "7", label: "Ban 7 days" },
  { value: "30", label: "Ban 30 days" },
  { value: "90", label: "Ban 90 days" },
  { value: "365", label: "Ban 1 year" },
  { value: "permanent", label: "Ban permanently" },
];

function Links({ urls, label }: { urls: string[]; label: string }) {
  if (urls.length === 0) return <span className="text-bk-muted">none</span>;
  return (
    <>
      {urls.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-bk-gold-light underline mr-3">
          {label} {i + 1}
        </a>
      ))}
    </>
  );
}

// Disputes from challenges: a poster doubting proof of a win, or a challenger
// saying a prize never arrived. Both sides' evidence is shown side by side.
export default function ChallengeDisputes({ initial }: { initial: AdminDispute[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"for_challenger" | "for_poster">("for_challenger");
  const [note, setNote] = useState("");
  const [ban, setBan] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function start(d: AdminDispute) {
    setOpen(open === d.id ? null : d.id);
    setOutcome("for_challenger");
    setNote("");
    setError(null);
    // A poster who ignored the 24h window is the case a ban is meant for.
    setBan(d.kind === "payment" && d.missedDeadline ? "permanent" : "none");
  }

  async function resolve(d: AdminDispute) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/challenge-disputes/${d.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, note, ban: d.kind === "payment" && outcome === "for_challenger" ? ban : "none" }),
    });
    if (!res.ok) setError((await res.json()).error.message);
    else {
      setItems((p) => p.filter((x) => x.id !== d.id));
      setOpen(null);
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">Challenge disputes ({items.length})</p>
      <p className="font-sans text-[12px] text-bk-muted mb-3">
        A payment dispute freezes the poster&apos;s other challenges until it is settled. A poster who misses the 24-hour
        window is flagged below.
      </p>
      {items.length === 0 && <p className="font-sans text-[13px] text-bk-muted">No open disputes.</p>}
      <div className="space-y-4">
        {items.map((d) => (
          <div key={d.id} className="bg-bk-surface border border-bk-border p-4">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-sans font-bold text-bk-heading">
                  {d.kind === "payment" ? "Payment dispute" : "Proof dispute"} · {d.challengeTitle}
                </p>
                <p className="font-sans text-[12px] text-bk-muted">
                  Poster {d.posterName} ({d.posterEmail}) · challenger {d.challengerName} ({d.challengerEmail}) · prize {d.prizeLabel}
                </p>
              </div>
              <div className="text-right shrink-0 font-sans text-[11px] uppercase tracking-[0.6px]">
                {d.missedDeadline && <p className="text-bk-live">Deadline missed</p>}
                <p className="text-bk-muted">{d.status === "awaiting_admin" ? "Ready to decide" : "Waiting for response"}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3 mt-3 font-sans text-[12px] text-bk-body">
              <div className="bg-bk-bg border border-bk-border p-3 space-y-1">
                <p className="text-bk-heading font-medium">{d.openedByPoster ? "Poster" : "Challenger"} opened this</p>
                <p className="whitespace-pre-wrap">{d.reason}</p>
                <p><Links urls={d.openerEvidenceUrls} label="Evidence" /></p>
              </div>
              <div className="bg-bk-bg border border-bk-border p-3 space-y-1">
                <p className="text-bk-heading font-medium">Response</p>
                {d.responderNote ? <p className="whitespace-pre-wrap">{d.responderNote}</p> : <p className="text-bk-muted">No response yet.</p>}
                <p><Links urls={d.responderEvidenceUrls} label="Evidence" /></p>
              </div>
            </div>

            <div className="mt-3 font-sans text-[12px] text-bk-body space-y-1">
              <p>
                Proof: match <span className="text-bk-heading">{d.matchId ?? "—"}</span> · <Links urls={d.proofUrls} label="Screenshot" />
                {d.proofNote ? ` · "${d.proofNote}"` : ""}
              </p>
              {d.kind === "payment" && (
                <>
                  <p>Pays via: {d.payoutDetails ? <span className="text-bk-heading whitespace-pre-wrap">{d.payoutDetails}</span> : "—"}</p>
                  <p>Receipt from poster: <Links urls={d.receiptUrls} label="Receipt" />{d.paymentNote ? ` · "${d.paymentNote}"` : ""}</p>
                </>
              )}
            </div>

            {open === d.id ? (
              <div className="mt-4 space-y-3 border-t border-bk-border pt-3">
                <div className="flex flex-wrap gap-4 font-sans text-[13px] text-bk-heading">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={outcome === "for_challenger"} onChange={() => setOutcome("for_challenger")} />
                    {d.kind === "payment" ? "Rule for the challenger (poster owes the prize)" : "Rule for the challenger (valid win)"}
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={outcome === "for_poster"} onChange={() => setOutcome("for_poster")} />
                    {d.kind === "payment" ? "Rule for the poster (it was paid)" : "Rule for the poster (not a win)"}
                  </label>
                </div>
                {d.kind === "payment" && outcome === "for_challenger" && (
                  <div>
                    <select value={ban} onChange={(e) => setBan(e.target.value)} className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] px-2 h-[34px]">
                      {BANS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                    <p className="font-sans text-[11px] text-bk-muted mt-1">
                      Banning also cancels the poster&apos;s open challenges. They get a further 24 hours to pay either way, and you can lift the ban once they show proof of payment.
                    </p>
                  </div>
                )}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Your decision and why (both sides can see this)"
                  className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2"
                />
                {error && <p className="font-sans text-[12px] text-bk-live">{error}</p>}
                <div className="flex gap-3">
                  <button disabled={busy} onClick={() => resolve(d)} className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] uppercase tracking-[0.6px] px-4 py-2 disabled:opacity-50">Record decision</button>
                  <button onClick={() => setOpen(null)} className="font-sans text-[12px] text-bk-muted underline">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => start(d)} className="mt-3 bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] uppercase tracking-[0.6px] px-3 py-1.5">Review</button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
