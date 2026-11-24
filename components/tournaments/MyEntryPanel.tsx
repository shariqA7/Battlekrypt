"use client";

// The signed-in player's own entry in this tournament, on the tournament page: which room, where
// they are in the waiting list, a payment still to send, what withdrawing would do, and (when
// waiting for a seat) other slots of the same game that have room. Signed out or not entered: nothing shows.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FileUpload from "@/components/ui/FileUpload";
import LocalDate from "@/components/ui/LocalDate";
import { toast } from "@/lib/toast";
import { seatsLeftText } from "@/lib/seat-view";
import type { MyEntry, MyEntryView } from "@/lib/services/my-entry";

const inputClass = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
const labelClass = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-3";
const primaryBtn =
  "bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-4 py-2.5 min-h-[40px] disabled:opacity-50";
const ghostBtn =
  "border border-bk-border text-bk-heading font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-4 py-2.5 min-h-[40px] hover:border-bk-gold-light disabled:opacity-50";

export default function MyEntryPanel({ tournamentId, paymentInstructions }: { tournamentId: string; paymentInstructions?: string | null }) {
  const router = useRouter();
  const [view, setView] = useState<MyEntryView | null>(null);
  const [tick, setTick] = useState(0); // bumped after a change so the panel asks again

  useEffect(() => {
    let alive = true;
    fetch(`/api/tournaments/${tournamentId}/my-entry`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data) setView(data);
      })
      .catch(() => {
        /* the panel is a convenience: if it can't load, the page still works */
      });
    return () => {
      alive = false;
    };
  }, [tournamentId, tick]);

  if (!view || view.entries.length === 0) return null;
  const changed = () => {
    setTick((n) => n + 1);
    router.refresh();
  };

  return (
    <section aria-label="Your entry" className="mt-8 max-w-xl space-y-3">
      {view.entries.map((e) => (
        <EntryCard key={e.id} entry={e} view={view} paymentInstructions={paymentInstructions ?? null} onChanged={changed} />
      ))}
      {view.entries.some((e) => e.status === "waitlisted") && view.alternatives.length > 0 && (
        <div className="border border-bk-border bg-bk-surface p-4">
          <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-1">Don&apos;t want to wait?</p>
          <p className="font-sans text-[13px] text-bk-body mb-3">These slots for the same game still have seats. You can join one now, today or later, and stay on this waiting list too.</p>
          <ul className="space-y-2">
            {view.alternatives.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/tournaments/${s.slug}`}
                  className="flex items-center justify-between gap-3 min-h-[48px] px-3 py-2 border border-bk-border bg-bk-bg hover:border-bk-gold-light transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block font-sans font-bold text-[13px] text-bk-heading truncate">{s.name}</span>
                    <span className="block font-sans text-[12px] text-bk-muted">
                      {s.startAt ? <LocalDate iso={s.startAt} format="long" /> : "Start time to be announced"}
                      {s.entryType === "paid" && s.fee ? ` · ${s.fee.currency} ${s.fee.amount.toLocaleString("en-US")}` : " · Free"}
                    </span>
                  </span>
                  <span className="shrink-0 font-sans text-[11px] uppercase tracking-[0.8px] text-bk-teal">{seatsLeftText(s.seatsLeft)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function EntryCard({ entry: e, view, paymentInstructions, onChanged }: { entry: MyEntry; view: MyEntryView; paymentInstructions: string | null; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/registrations/${e.id}/withdraw`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error?.message ?? "Couldn't withdraw. Try again.");
        setBusy(false);
        return;
      }
      toast(body?.refund?.reason ? `You withdrew. ${body.refund.reason}` : "You withdrew.", "info");
      setConfirming(false);
      setBusy(false);
      onChanged();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  const heading =
    e.status === "waitlisted" ? `You're #${e.position ?? "?"} on the waiting list`
    : e.status === "withdrawn" ? (e.releaseReason === "payment_window_expired" ? "Your seat was released" : "You withdrew")
    : e.needsPayment ? "A seat opened for you"
    : e.room ? `You're in ${e.room.label}`
    : e.status === "approved" ? "You're in" : "You've entered";

  return (
    <div className={`border bg-bk-surface p-4 ${e.needsPayment ? "border-bk-gold-light" : "border-bk-border"}`}>
      <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted">{e.name}</p>
      <h2 className="font-sans font-bold text-[16px] text-bk-heading mt-0.5">{heading}</h2>

      {e.room?.startAt && ["pending", "approved"].includes(e.status) && (
        <p className="font-sans text-[13px] text-bk-body mt-1"><LocalDate iso={e.room.startAt} format="long" /></p>
      )}
      {e.status === "pending" && !e.needsPayment && <p className="font-sans text-[13px] text-bk-body mt-1">Waiting for the organizer to approve your entry.</p>}
      {e.status === "approved" && <p className="font-sans text-[13px] text-bk-teal mt-1">Approved.</p>}

      {e.status === "waitlisted" && (
        <p className="font-sans text-[13px] text-bk-body mt-1">
          Every seat is taken. {e.waitingTotal > 1 ? `${e.waitingTotal} teams are waiting. ` : ""}You get the next free seat automatically, first come, first served
          {view.policy.paid ? ", and you pay only when it opens" : ""}. We&apos;ll notify you.
        </p>
      )}

      {e.needsPayment && e.payDueAt && <PayForSeat entry={e} paymentInstructions={paymentInstructions} onDone={onChanged} />}

      {e.status === "withdrawn" && (
        <p className="font-sans text-[13px] text-bk-body mt-1">
          {e.releaseReason === "payment_window_expired"
            ? "Payment didn't arrive in time, so the seat went to the next team in line. You can join again if there is still room."
            : "Your seat was offered to the next team in line."}
          {e.refund ? ` Refund: ${e.refund.label}.` : ""}
        </p>
      )}

      {e.withdraw && !confirming && (
        <div className="mt-4">
          <button type="button" onClick={() => setConfirming(true)} className={ghostBtn}>
            {e.status === "waitlisted" ? "Leave the waiting list" : "Withdraw from this tournament"}
          </button>
        </div>
      )}

      {e.withdraw && confirming && (
        <div className="mt-4 border border-bk-border bg-bk-bg p-3" role="group" aria-label="Confirm withdrawal">
          <p className="font-sans font-bold text-[13px] text-bk-heading">
            {e.status === "waitlisted" ? "Leave the waiting list?" : "Withdraw and give up your seat?"}
          </p>
          <p className="font-sans text-[13px] text-bk-body mt-1">{e.withdraw.refundText}</p>
          {e.withdraw.hadSeat && <p className="font-sans text-[12px] text-bk-muted mt-1">Your seat goes straight to the next team in line.</p>}
          <label className={labelClass} htmlFor={`why-${e.id}`}>Reason (optional)</label>
          <input id={`why-${e.id}`} value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={200} className={inputClass} placeholder="Tell the organizer why" />
          {error && <p className="text-bk-live text-[12px] font-sans mt-2" role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" onClick={withdraw} disabled={busy} className={primaryBtn}>{busy ? "Withdrawing..." : "Yes, withdraw"}</button>
            <button type="button" onClick={() => { setConfirming(false); setError(null); }} disabled={busy} className={ghostBtn}>Keep my place</button>
          </div>
        </div>
      )}
      {e.canManage === false && ["pending", "approved", "waitlisted"].includes(e.status) && (
        <p className="font-sans text-[12px] text-bk-muted mt-3">Only the person who entered the team can withdraw it.</p>
      )}
    </div>
  );
}

function PayForSeat({ entry, paymentInstructions, onDone }: { entry: MyEntry; paymentInstructions: string | null; onDone: () => void }) {
  const [proof, setProof] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!entry.canManage) {
    return <p className="font-sans text-[13px] text-bk-body mt-1">The person who entered this team needs to send the payment.</p>;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!proof) return setError("Upload your payment screenshot.");
    if (!reference.trim()) return setError("Enter the transaction ID from your receipt.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/registrations/${entry.id}/payment`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentProofUrl: proof, paymentReference: reference.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error?.message ?? "Couldn't send the payment.");
        setBusy(false);
        if (body?.error?.code === "payment_window_over") onDone();
        return;
      }
      toast("Payment sent. The organizer will check it and approve your entry.", "success");
      setBusy(false);
      onDone();
    } catch {
      setError("Couldn't reach the server. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-1">
      <p className="font-sans text-[13px] text-bk-body">
        {entry.room ? `${entry.room.label} is yours. ` : ""}Send your payment by <strong className="text-bk-heading"><LocalDate iso={entry.payDueAt as string} format="long" /></strong> or the seat goes to the next team.
      </p>
      {paymentInstructions && (
        <div className="bg-bk-bg border border-bk-gold-light/40 px-3 py-2.5 mt-3">
          <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-1">How to pay</p>
          <p className="font-sans text-[13px] text-bk-heading whitespace-pre-wrap">{paymentInstructions}</p>
        </div>
      )}
      <label className={labelClass}>Proof of payment</label>
      <FileUpload bucket="payment-proofs" isPrivate ownerFolder pathPrefix="payment-proofs" label="Upload payment screenshot" onUploaded={setProof} />
      <label className={labelClass}>Transaction ID</label>
      <input value={reference} onChange={(ev) => setReference(ev.target.value)} maxLength={120} autoComplete="off" placeholder="From your payment receipt" className={inputClass} />
      {error && <p className="text-bk-live text-[12px] font-sans mt-2" role="alert">{error}</p>}
      <button type="submit" disabled={busy} className={`${primaryBtn} mt-4`}>{busy ? "Sending..." : "Send payment"}</button>
    </form>
  );
}
