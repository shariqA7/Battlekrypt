"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import SeatsPicker from "@/components/tournaments/SeatsPicker";
import RefundPolicyNote from "@/components/tournaments/RefundPolicyNote";
import { toast } from "@/lib/toast";
import { joinOutcomeMessage, type PublicSeats } from "@/lib/seat-view";
import type { RefundPolicyKey } from "@/lib/seat-settings";

interface CustomField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
}

interface TournamentForJoin {
  entryType: string;
  mode: string;
  customFields: unknown;
  paymentInstructions: string | null;
}

export default function JoinForm({
  tournamentId,
  tournament,
  slug,
  startAt,
  seats,
  refund,
}: {
  tournamentId: string;
  tournament: TournamentForJoin;
  slug: string;
  startAt: string | null;
  seats: PublicSeats | null;
  refund: { policy: RefundPolicyKey; cutoffHours: number; payWindowMinutes: number };
}) {
  const router = useRouter();
  const [paymentProofUrl, setPaymentProofUrl] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [teamName, setTeamName] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [roomId, setRoomId] = useState("");
  const [ackRefund, setAckRefund] = useState(false);
  // Set when the server says a seat opened while this page said "full": payment is needed after all.
  const [seatOpened, setSeatOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const paid = tournament.entryType === "paid";
  // Every seat taken: the team joins the waiting list and pays nothing until a seat opens for it.
  const queueing = !!seats && seats.full && !seatOpened;
  const payNow = paid && !queueing;

  const customFields: CustomField[] = Array.isArray(tournament.customFields)
    ? (tournament.customFields as CustomField[])
    : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (payNow && !paymentReference.trim()) {
      setError("Please enter the transaction ID shown on your payment receipt.");
      return;
    }
    if (payNow && !paymentProofUrl) {
      setError("Please upload proof of payment before submitting.");
      return;
    }
    if (paid && !ackRefund) {
      setError("Please confirm you've read the refund policy.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customFieldResponses: fieldValues,
          paymentProofUrl: payNow ? paymentProofUrl || undefined : undefined,
          paymentReference: payNow ? paymentReference.trim() || undefined : undefined,
          teamName: tournament.mode !== "solo" ? teamName : undefined,
          roomId: roomId || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = body?.error?.code as string | undefined;
        if (queueing && (code === "payment_proof_required" || code === "payment_reference_required")) {
          // A seat opened between loading this page and pressing the button. Ask for payment now.
          setSeatOpened(true);
          setError("A seat just opened up. Add your payment below to take it.");
        } else {
          setError(body?.error?.message ?? "Couldn't save your entry. Try again.");
        }
        setSubmitting(false);
        return;
      }
      const asked = roomId ? seats?.rooms.find((r) => r.id === roomId) ?? null : null;
      const outcome = joinOutcomeMessage(body.entry, asked, { paid });
      toast(outcome.text, outcome.kind);
      // A waiting team lands on the tournament page, which shows its place in line and other open slots.
      router.push(body.entry?.status === "waitlisted" ? `/tournaments/${slug}` : "/dashboard");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
  const labelClass =
    "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

  return (
    <form onSubmit={handleSubmit}>
      {tournament.mode !== "solo" && (
        <>
          <label className={labelClass}>Team name</label>
          <input
            required
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className={inputClass}
          />
        </>
      )}

      {customFields.filter((f) => (f as { type?: string }).type === "condition").length > 0 && (
        <div className="mt-4 border border-bk-border px-3 py-2.5">
          <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-2">
            Entry conditions
          </p>
          {customFields
            .filter((f) => (f as { type?: string }).type === "condition")
            .map((field) => {
              const url = (field as { url?: string }).url;
              return (
                <label key={field.key} className="flex items-start gap-2 font-sans text-[13px] text-bk-heading mb-1.5">
                  <input
                    type="checkbox"
                    required
                    checked={fieldValues[field.key] === "yes"}
                    onChange={(e) =>
                      setFieldValues((prev) => ({ ...prev, [field.key]: e.target.checked ? "yes" : "" }))
                    }
                    className="mt-1"
                  />
                  <span>
                    {field.label}
                    {url && (
                      <>
                        {" "}
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-bk-gold-light underline">
                          open link
                        </a>
                      </>
                    )}
                  </span>
                </label>
              );
            })}
          <p className="font-sans text-[11px] text-bk-muted mt-1">
            The organizer checks these before approving you.
          </p>
        </div>
      )}

      {customFields.filter((f) => (f as { type?: string }).type !== "condition").map((field) => (
        <div key={field.key}>
          <label className={labelClass}>{field.label}</label>
          <input
            required={field.required}
            value={fieldValues[field.key] ?? ""}
            onChange={(e) =>
              setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
            }
            className={inputClass}
          />
        </div>
      ))}

      {queueing && (
        <div className="bg-bk-bg border border-bk-gold-light/40 px-3 py-2.5 mt-4" role="status">
          <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-1">Every seat is taken</p>
          <p className="font-sans text-[13px] text-bk-heading">
            Join the waiting list and you get the next free seat automatically, first come, first served.
            {paid ? " You pay nothing now. If a seat opens for you, you'll be asked to pay then." : ""}
          </p>
        </div>
      )}

      {!queueing && seats?.hasRooms && (
        <>
          <label className={labelClass}>Choose your room</label>
          <SeatsPicker seats={seats} value={roomId} onChange={setRoomId} fallbackStart={startAt} inputClass={inputClass} />
        </>
      )}

      {payNow && (
        <>
          {tournament.paymentInstructions && (
            <div className="bg-bk-bg border border-bk-gold-light/40 px-3 py-2.5 mt-4">
              <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-1">
                How to pay
              </p>
              <p className="font-sans text-[13px] text-bk-heading whitespace-pre-wrap">
                {tournament.paymentInstructions}
              </p>
            </div>
          )}

          <label className={labelClass}>Proof of payment</label>
          <FileUpload
            bucket="payment-proofs"
            isPrivate
            ownerFolder
            pathPrefix="payment-proofs"
            label="Upload payment screenshot"
            onUploaded={setPaymentProofUrl}
          />
          <label className={labelClass}>Transaction ID</label>
          <input
            type="text"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            maxLength={120}
            autoComplete="off"
            placeholder="From your payment receipt"
            className={inputClass}
          />
        </>
      )}

      {paid && (
        <div className="mt-5">
          <RefundPolicyNote policy={refund.policy} cutoffHours={refund.cutoffHours} payWindowMinutes={seats?.waitlistEnabled ? refund.payWindowMinutes : undefined} />
          <label className="flex items-start gap-2 mt-3 cursor-pointer">
            <input type="checkbox" checked={ackRefund} onChange={(e) => setAckRefund(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0" />
            <span className="font-sans text-[13px] text-bk-body">I&apos;ve read the refund policy and agree to it.</span>
          </label>
        </div>
      )}

      {error && <p className="text-bk-live text-[12px] font-sans mt-4" role="alert">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 mt-6 disabled:opacity-50"
      >
        {submitting ? "Submitting..." : queueing ? "Join the waiting list" : "Submit registration"}
      </button>
    </form>
  );
}
