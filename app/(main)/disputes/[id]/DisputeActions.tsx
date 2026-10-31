"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";

const btn = "font-sans font-bold text-[13px] px-4 min-h-[44px] disabled:opacity-50";

export default function DisputeActions({
  disputeId,
  canRespond,
  refund,
}: {
  disputeId: string;
  canRespond: boolean;
  /** Which refund buttons this viewer may use right now. */
  refund: { canMarkSent: boolean; canConfirm: boolean; canContest: boolean };
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data?.error?.message ?? "Something went wrong.");
    router.refresh();
  }
  const refundAction = (action: "sent" | "received" | "contest") => post(`/api/disputes/${disputeId}/refund`, { action });

  return (
    <div className="space-y-5">
      {canRespond && (
        <section className="bg-bk-surface border border-bk-border p-4 space-y-3">
          <h2 className="font-sans font-bold text-[15px] text-bk-heading">Your response</h2>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1500} placeholder="Tell your side. An admin reads both."
            className="w-full bg-bk-bg border border-bk-border px-3 py-2 font-sans text-[14px] text-bk-heading" />
          {evidence.length < 5 && (
            <FileUpload bucket="payment-proofs" isPrivate ownerFolder pathPrefix="dispute-evidence" label="Add a screenshot (optional)" onUploaded={(u) => setEvidence((e) => [...e, u])} />
          )}
          {evidence.length > 0 && <p className="font-sans text-[12px] text-bk-muted">{evidence.length} uploaded</p>}
          <button type="button" disabled={busy || note.trim().length < 5} onClick={() => post(`/api/disputes/${disputeId}/respond`, { note, evidenceUrls: evidence })} className={`${btn} bg-bk-primary text-bk-on-primary`}>
            Send response
          </button>
        </section>
      )}

      {(refund.canMarkSent || refund.canConfirm || refund.canContest) && (
        <section className="flex flex-wrap gap-2">
          {refund.canMarkSent && <button type="button" disabled={busy} onClick={() => refundAction("sent")} className={`${btn} bg-bk-primary text-bk-on-primary`}>I&apos;ve paid the refund</button>}
          {refund.canConfirm && <button type="button" disabled={busy} onClick={() => refundAction("received")} className={`${btn} bg-bk-primary text-bk-on-primary`}>I received the refund</button>}
          {refund.canContest && <button type="button" disabled={busy} onClick={() => refundAction("contest")} className={`${btn} border border-bk-border text-bk-heading`}>It hasn&apos;t arrived</button>}
        </section>
      )}
      {error && <p role="alert" className="font-sans text-[12px] text-bk-live">{error}</p>}
    </div>
  );
}
