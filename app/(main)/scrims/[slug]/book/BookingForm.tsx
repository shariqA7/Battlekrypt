"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import { Panel } from "@/components/ui/Panel";
import { formatMoney } from "@/lib/money";

interface Session { id: string; day: string; time: string; weekday: number; spotsLeft: number }
interface Team { id: string; name: string; members: { id: string; name: string }[] }
const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const input = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";
const quick = "border border-bk-border text-bk-body font-sans text-[12px] px-3 h-[30px] hover:border-bk-gold-light/60";

export default function BookingForm({
  slug, paid, fee, currency, paymentInstructions, timezone, teams, sessions,
}: { slug: string; paid: boolean; fee: number | null; currency: string | null; paymentInstructions: string | null; timezone: string; teams: Team[]; sessions: Session[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [members, setMembers] = useState<Record<string, string[]>>(() => Object.fromEntries(teams.map((t) => [t.id, t.members.map((m) => m.id)])));
  const [proofUrl, setProofUrl] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const out: { day: string; items: Session[] }[] = [];
    for (const s of sessions) { const g = out[out.length - 1]; if (g && g.day === s.day) g.items.push(s); else out.push({ day: s.day, items: [s] }); }
    return out;
  }, [sessions]);
  const weekdaysPresent = useMemo(() => [...new Set(sessions.map((s) => s.weekday))].sort(), [sessions]);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickWhere = (f: (s: Session) => boolean) => setPicked((p) => { const n = new Set(p); sessions.filter(f).forEach((s) => n.add(s.id)); return n; });
  const total = paid && fee !== null ? fee * picked.size : 0;
  const team = teams.find((t) => t.id === teamId);
  const chosenMembers = members[teamId] ?? [];

  async function submit() {
    setError(null);
    if (picked.size === 0) return setError("Choose at least one session.");
    if (teams.length > 0 && chosenMembers.length === 0) return setError("Choose the players on your team.");
    if (paid && !reference.trim()) return setError("Enter the transaction ID shown on your payment receipt.");
    if (paid && !proofUrl) return setError("Upload proof of payment before booking.");
    setBusy(true);
    const res = await fetch(`/api/scrims/${slug}/book`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionIds: [...picked], teamId: teams.length ? teamId : undefined, memberPlayerIds: teams.length ? chosenMembers : undefined,
        paymentProofUrl: proofUrl || undefined, paymentReference: reference.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong. Please try again.");
    router.push("/bookings?booked=1");
  }

  return (
    <div>
      <Panel className="p-5 mb-6">
        <p className="font-sans font-bold text-bk-heading text-[14px] mb-3">1. Choose your sessions</p>
        <div className="flex flex-wrap gap-2 mb-4">
          <button type="button" className={quick} onClick={() => pickWhere(() => true)}>All sessions</button>
          {weekdaysPresent.map((d) => <button key={d} type="button" className={quick} onClick={() => pickWhere((s) => s.weekday === d)}>All {WEEKDAYS[d]}</button>)}
          <button type="button" className={quick} onClick={() => setPicked(new Set())}>Clear</button>
        </div>
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.day}>
              <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">{g.day}</p>
              <div className="flex flex-wrap gap-2">
                {g.items.map((s) => (
                  <label key={s.id} className={`flex items-center gap-2 border px-3 h-[38px] font-mono text-[13px] cursor-pointer ${picked.has(s.id) ? "border-bk-gold-light text-bk-heading" : "border-bk-border text-bk-body"}`}>
                    <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                    {s.time}
                    <span className="font-sans text-[10px] text-bk-muted">{s.spotsLeft} left</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="font-sans text-[11px] text-bk-muted mt-3">Times are in {timezone}.</p>
      </Panel>

      {teams.length > 0 && (
        <Panel className="p-5 mb-6">
          <p className="font-sans font-bold text-bk-heading text-[14px] mb-3">2. Your team</p>
          {teams.length > 1 && (
            <select className={input} value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team">
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {teams.length === 1 && <p className="font-sans text-[13px] text-bk-heading">{team?.name}</p>}
          <label className={label}>Players</label>
          <div className="flex flex-wrap gap-3">
            {team?.members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 font-sans text-[13px] text-bk-body">
                <input type="checkbox" checked={chosenMembers.includes(m.id)} onChange={(e) => setMembers((x) => ({ ...x, [teamId]: e.target.checked ? [...(x[teamId] ?? []), m.id] : (x[teamId] ?? []).filter((y) => y !== m.id) }))} />
                {m.name}
              </label>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="p-5">
        <p className="font-sans font-bold text-bk-heading text-[14px] mb-1">{teams.length > 0 ? "3" : "2"}. {paid ? "Pay once" : "Confirm"}</p>
        {paid && fee !== null && currency ? (
          <>
            <p className="font-mono text-[15px] text-bk-heading mt-2">{picked.size} session{picked.size === 1 ? "" : "s"} × {formatMoney(fee, currency)} = <span className="text-bk-gold-light">{formatMoney(total, currency)}</span></p>
            {paymentInstructions && (
              <div className="bg-bk-bg border border-bk-gold-light/40 px-3 py-2.5 mt-3">
                <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-1">How to pay</p>
                <p className="font-sans text-[13px] text-bk-heading whitespace-pre-wrap">{paymentInstructions}</p>
              </div>
            )}
            <label className={label}>Proof of payment (one screenshot for the whole amount)</label>
            <FileUpload bucket="payment-proofs" isPrivate ownerFolder pathPrefix="payment-proofs" label="Upload payment screenshot" onUploaded={setProofUrl} />
            <label className={label} htmlFor="bk-ref">Transaction ID</label>
            <input id="bk-ref" className={input} value={reference} maxLength={120} autoComplete="off" placeholder="From your payment receipt" onChange={(e) => setReference(e.target.value)} />
            <p className="font-sans text-[11px] text-bk-muted mt-3">If the organizer can&apos;t run a session you paid for, you can move to the next session or get a refund.</p>
          </>
        ) : (
          <p className="font-sans text-[13px] text-bk-body mt-2">These sessions are free. {picked.size} chosen.</p>
        )}
        {error && <p className="text-bk-live text-[12px] font-sans mt-3" role="alert">{error}</p>}
        <button type="button" disabled={busy} onClick={submit} className="mt-5 bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-5 py-3 disabled:opacity-50">
          {busy ? "Booking…" : paid ? `Book and pay ${currency && fee !== null ? formatMoney(total, currency) : ""}` : "Book sessions"}
        </button>
      </Panel>
    </div>
  );
}
