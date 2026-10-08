"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AdminReportedChallenge {
  id: string;
  title: string;
  description: string;
  status: string;
  gameName: string;
  posterName: string;
  posterEmail: string | null;
  prizeLabel: string;
  reports: { id: string; reason: string; details: string | null; reporterEmail: string | null; createdAt: string }[];
}

export interface AdminFlag {
  id: string;
  kind: "same_device" | "same_network" | "repeat_pair";
  details: string;
  createdAt: string;
  challengeId: string;
  challengeTitle: string;
  entryName: string;
  entryStage: string;
  posterEmail: string | null;
  challengerEmail: string | null;
}

const REASON_LABEL: Record<string, string> = {
  scam: "Looks like a scam", misleading: "Misleading prize", inappropriate: "Inappropriate", spam: "Spam", other: "Other",
};
const KIND_LABEL: Record<string, string> = {
  same_device: "Same network + browser", same_network: "Same IP address", repeat_pair: "Repeated pairing",
};
const BANS = [
  { value: "none", label: "No ban" }, { value: "7", label: "Ban 7 days" }, { value: "30", label: "Ban 30 days" },
  { value: "90", label: "Ban 90 days" }, { value: "permanent", label: "Ban permanently" },
];
const area = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2";

// Reports on challenges, and pairs of accounts that look linked. A flag is a
// prompt to look, never proof — shared IPs are common — so nothing here is
// automatic and the wording says so.
export default function ChallengeIntegrity({
  reported,
  flags,
}: {
  reported: AdminReportedChallenge[];
  flags: AdminFlag[];
}) {
  const router = useRouter();
  const [reports, setReports] = useState(reported);
  const [flagList, setFlagList] = useState(flags);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [ban, setBan] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: Record<string, unknown>, onOk: () => void) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) setError((await res.json()).error.message);
    else {
      onOk();
      setOpen(null);
      setNote("");
      setBan("none");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <section className="space-y-8">
      <div>
        <p className="font-sans font-medium text-bk-heading text-sm mb-1">Reported challenges ({reports.length})</p>
        <p className="font-sans text-[12px] text-bk-muted mb-3">
          Three open reports hide a challenge and pause applications until you decide. Removal is only possible
          before challengers are picked.
        </p>
        {reports.length === 0 && <p className="font-sans text-[13px] text-bk-muted">No reports waiting.</p>}
        <div className="space-y-3">
          {reports.map((c) => (
            <div key={c.id} className="bg-bk-surface border border-bk-border p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-sans font-bold text-bk-heading">{c.title}</p>
                  <p className="font-sans text-[12px] text-bk-muted">
                    {c.gameName} · {c.posterName} ({c.posterEmail}) · {c.prizeLabel} · {c.status.replace("_", " ")}
                  </p>
                </div>
                <p className="font-sans text-[12px] text-bk-live shrink-0">{c.reports.length} report{c.reports.length === 1 ? "" : "s"}</p>
              </div>
              <p className="font-sans text-[13px] text-bk-body whitespace-pre-wrap mt-2">{c.description}</p>
              <ul className="mt-3 space-y-1 font-sans text-[12px] text-bk-body">
                {c.reports.map((r) => (
                  <li key={r.id}>
                    <span className="text-bk-heading">{REASON_LABEL[r.reason] ?? r.reason}</span>
                    {r.details ? ` — ${r.details}` : ""} <span className="text-bk-muted">({r.reporterEmail})</span>
                  </li>
                ))}
              </ul>
              <a href={`/challenges/${c.id}`} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 font-sans text-[12px] text-bk-gold-light underline">Open the challenge</a>

              {open === c.id ? (
                <div className="mt-3 space-y-3 border-t border-bk-border pt-3">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={area} placeholder="Decision note (the poster sees it if the challenge is removed)" />
                  <select value={ban} onChange={(e) => setBan(e.target.value)} className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] px-2 h-[34px]">
                    {BANS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                  {error && <p className="font-sans text-[12px] text-bk-live">{error}</p>}
                  <div className="flex flex-wrap gap-3">
                    <button disabled={busy} onClick={() => post(`/api/admin/challenge-reports/${c.id}/resolve`, { action: "remove", note, ban }, () => setReports((p) => p.filter((x) => x.id !== c.id)))} className="bg-bk-live text-white font-sans font-bold text-[11px] uppercase px-4 py-2 disabled:opacity-50">Remove challenge</button>
                    <button disabled={busy} onClick={() => post(`/api/admin/challenge-reports/${c.id}/resolve`, { action: "dismiss", note, ban }, () => setReports((p) => p.filter((x) => x.id !== c.id)))} className="border border-bk-border text-bk-heading font-sans font-bold text-[11px] uppercase px-4 py-2 disabled:opacity-50">Dismiss reports</button>
                    <button onClick={() => setOpen(null)} className="font-sans text-[12px] text-bk-muted underline">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setOpen(c.id); setError(null); }} className="mt-3 bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] uppercase px-3 py-1.5">Review</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="font-sans font-medium text-bk-heading text-sm mb-1">Suspicious pairings ({flagList.length})</p>
        <p className="font-sans text-[12px] text-bk-muted mb-3">
          Automatic signals only. Shared households, internet cafés and mobile carriers share IP addresses,
          so look at the proof and payment history before ending anything.
        </p>
        {flagList.length === 0 && <p className="font-sans text-[13px] text-bk-muted">No flags.</p>}
        <div className="space-y-3">
          {flagList.map((f) => (
            <div key={f.id} className="bg-bk-surface border border-bk-border p-4">
              <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-amber">{KIND_LABEL[f.kind]}</p>
              <p className="font-sans font-bold text-bk-heading mt-1">{f.challengeTitle}</p>
              <p className="font-sans text-[12px] text-bk-muted">
                Poster {f.posterEmail} · challenger {f.entryName} ({f.challengerEmail}) · entry {f.entryStage.replace(/_/g, " ")}
              </p>
              <p className="font-sans text-[13px] text-bk-body mt-2">{f.details}</p>
              {open === f.id ? (
                <div className="mt-3 space-y-3 border-t border-bk-border pt-3">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={area} placeholder="Your note" />
                  {error && <p className="font-sans text-[12px] text-bk-live">{error}</p>}
                  <div className="flex flex-wrap gap-3">
                    <button disabled={busy} onClick={() => post(`/api/admin/challenge-flags/${f.id}/resolve`, { action: "dismiss", note }, () => setFlagList((p) => p.filter((x) => x.id !== f.id)))} className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] uppercase px-4 py-2 disabled:opacity-50">Looks fine</button>
                    <button disabled={busy} onClick={() => post(`/api/admin/challenge-flags/${f.id}/resolve`, { action: "fail_entry", note }, () => setFlagList((p) => p.filter((x) => x.id !== f.id)))} className="bg-bk-live text-white font-sans font-bold text-[11px] uppercase px-4 py-2 disabled:opacity-50">End this entry</button>
                    <button onClick={() => setOpen(null)} className="font-sans text-[12px] text-bk-muted underline">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setOpen(f.id); setError(null); }} className="mt-3 bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] uppercase px-3 py-1.5">Review</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
