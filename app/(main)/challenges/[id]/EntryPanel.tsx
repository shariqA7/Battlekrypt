"use client";

// One picked challenger's progress: proof -> payment -> done, with the forms
// for whichever side (poster or challenger) has to act next. All the rules are
// enforced on the server; this only shows the right step.
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import type { EntryView } from "@/lib/services/challenge-fulfillment";

const STAGE_LABEL: Record<string, string> = {
  playing: "Waiting for proof",
  proof_review: "Proof under review",
  proof_disputed: "Proof disputed",
  awaiting_payout_details: "Waiting for payout details",
  awaiting_payment: "Waiting for payment",
  payment_sent: "Payment sent",
  payment_disputed: "Payment disputed",
  completed: "Completed",
  failed: "Not completed",
};
const FAIL_TEXT: Record<string, string> = {
  no_proof: "No proof was submitted before the deadline.",
  proof_rejected: "An admin ruled the proof didn't show a win.",
  no_payout_details: "No payout details were provided in time.",
};
const field = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";
const area = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2";
const primary = "bg-white text-bk-bg font-sans font-bold text-[11px] uppercase tracking-[0.6px] px-4 py-2 disabled:opacity-50";
const danger = "border border-bk-live text-bk-live font-sans font-bold text-[11px] uppercase tracking-[0.6px] px-4 py-2 disabled:opacity-50";

// Dates are formatted in the browser only, so the server's time zone can't
// disagree with the viewer's.
const noSubscribe = () => () => {};
function When({ iso, prefix = "" }: { iso: string | null; prefix?: string }) {
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!iso || !inBrowser) return null;
  return <>{prefix}{new Date(iso).toLocaleString()}</>;
}

function Links({ urls, label }: { urls: string[]; label: string }) {
  if (urls.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-x-3">
      {urls.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-bk-gold-light underline">
          {label} {i + 1}
        </a>
      ))}
    </span>
  );
}

// Upload up to `max` screenshots; each upload is added to the list.
function UploadSet({ label, urls, setUrls, max, folder }: { label: string; urls: string[]; setUrls: (u: string[]) => void; max: number; folder: string }) {
  return (
    <div className="space-y-2">
      {urls.map((u, i) => (
        <p key={u} className="font-sans text-[12px] text-bk-body">
          {label} {i + 1} uploaded ·{" "}
          <button type="button" onClick={() => setUrls(urls.filter((x) => x !== u))} className="text-bk-live underline">remove</button>
        </p>
      ))}
      {urls.length < max && (
        <FileUpload key={urls.length} bucket="tournament-assets" pathPrefix={folder} label={`Upload ${label.toLowerCase()}`} onUploaded={(u) => setUrls([...urls, u])} />
      )}
    </div>
  );
}

type Act = (action: string, body?: Record<string, unknown>) => Promise<boolean>;

export default function EntryPanel({
  entry,
  role,
  prizeType,
}: {
  entry: EntryView;
  role: "poster" | "challenger";
  prizeType: "cash" | "in_game" | "reward";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act: Act = async (action, body = {}) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/challenge-entries/${entry.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error.message);
      return false;
    }
    router.refresh();
    return true;
  };

  const d = entry.dispute;
  const awaitingMyResponse =
    !!d && d.status === "awaiting_response" &&
    ((d.kind === "proof" && role === "challenger") || (d.kind === "payment" && role === "poster"));

  return (
    <div className="bg-bk-surface border border-bk-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-sans font-bold text-bk-heading">{entry.entrantName}</p>
          <p className="font-sans text-[12px] text-bk-muted">{entry.kind === "team" ? "Team" : "Player"} · rating {entry.rating}</p>
        </div>
        <span className="font-sans text-[11px] uppercase tracking-[0.6px] px-2 py-1 bg-bk-bg text-bk-gold-light shrink-0">
          {STAGE_LABEL[entry.stage]}
        </span>
      </div>

      {/* Proof the poster reviews / the challenger sent */}
      {entry.matchId && (
        <div className="mt-3 font-sans text-[12px] text-bk-body space-y-1">
          <p>Match ID: <span className="text-bk-heading">{entry.matchId}</span></p>
          <p><Links urls={entry.proofUrls} label="Screenshot" /></p>
          {entry.proofNote && <p>Note: {entry.proofNote}</p>}
        </div>
      )}
      {entry.paymentReceiptUrls.length > 0 && (
        <p className="mt-2 font-sans text-[12px] text-bk-body">
          {prizeType === "reward" ? "Delivery proof: " : "Receipt: "}
          <Links urls={entry.paymentReceiptUrls} label="Screenshot" />
        </p>
      )}
      {entry.paymentOwed && entry.stage !== "completed" && (
        <p className="mt-2 font-sans text-[12px] text-bk-live">An admin ruled this prize is owed.</p>
      )}

      {d && (
        <div className="mt-3 border-l-2 border-bk-live pl-3 font-sans text-[12px] text-bk-body space-y-1">
          <p className="text-bk-heading font-medium">
            {d.kind === "proof" ? "Proof dispute" : "Payment dispute"}
            {d.status === "resolved" && ` — decided ${d.outcome === "for_challenger" ? "for the challenger" : "for the poster"}`}
          </p>
          <p>{d.openedByViewer ? "You said" : "They said"}: {d.reason}</p>
          <Links urls={d.openerEvidenceUrls} label="Evidence" />
          {d.responderNote && <p>Response: {d.responderNote}</p>}
          <Links urls={d.responderEvidenceUrls} label="Response evidence" />
          {d.status === "awaiting_response" && <p className="text-[#EF9F27]"><When iso={d.responseDueAt} prefix="Response due by " /></p>}
          {d.missedDeadline && <p className="text-bk-live">The response deadline was missed.</p>}
          {d.status === "awaiting_admin" && <p>Waiting for an admin to decide.</p>}
          {d.adminNote && <p>Admin: {d.adminNote}</p>}
        </div>
      )}

      <div className="mt-4">
        {entry.stage === "failed" && <p className="font-sans text-[13px] text-bk-body">{FAIL_TEXT[entry.failedReason ?? ""] ?? "This entry wasn't completed."}</p>}
        {entry.stage === "completed" && <p className="font-sans text-[13px] text-bk-gold-light">The prize has been settled.</p>}

        {/* ------- challenger ------- */}
        {role === "challenger" && entry.stage === "playing" && <ProofForm act={act} busy={busy} deadline={entry.stageDeadline} />}
        {role === "challenger" && entry.stage === "proof_review" && (
          <p className="font-sans text-[13px] text-bk-body">The poster is reviewing your proof. <When iso={entry.stageDeadline} prefix="If they don't respond by " /> it counts as confirmed.</p>
        )}
        {role === "challenger" && entry.stage === "awaiting_payout_details" && (
          <DetailsForm act={act} busy={busy} prizeType={prizeType} deadline={entry.stageDeadline} />
        )}
        {role === "challenger" && entry.stage === "awaiting_payment" && (
          <div className="space-y-3">
            <p className="font-sans text-[13px] text-bk-body">
              Waiting for the poster to {prizeType === "reward" ? "deliver the reward" : "pay"}. <When iso={entry.stageDeadline} prefix="Their deadline: " />
            </p>
            {entry.canReportNotPaid && <ReportForm act={act} busy={busy} intro="The poster's payment deadline has passed." />}
          </div>
        )}
        {role === "challenger" && entry.stage === "payment_sent" && (
          <div className="space-y-3">
            <p className="font-sans text-[13px] text-bk-body">
              The poster says it was sent. Please check and confirm. <When iso={entry.stageDeadline} prefix="If you don't respond by " /> it will be treated as received.
            </p>
            <div className="flex flex-wrap gap-3">
              <button disabled={busy} onClick={() => act("confirm-received")} className={primary}>I received it</button>
            </div>
            <ReportForm act={act} busy={busy} intro="Didn't receive it?" />
          </div>
        )}
        {role === "challenger" && entry.stage === "proof_disputed" && !awaitingMyResponse && (
          <p className="font-sans text-[13px] text-bk-body">An admin is reviewing the dispute.</p>
        )}
        {role === "challenger" && entry.stage === "payment_disputed" && (
          <p className="font-sans text-[13px] text-bk-body">Your report was sent. The poster must show proof of payment, then an admin decides.</p>
        )}

        {/* ------- poster ------- */}
        {role === "poster" && entry.stage === "playing" && (
          <p className="font-sans text-[13px] text-bk-body">Waiting for {entry.entrantName} to submit proof. <When iso={entry.stageDeadline} prefix="Deadline: " /></p>
        )}
        {role === "poster" && entry.stage === "proof_review" && <ReviewForm act={act} busy={busy} deadline={entry.stageDeadline} />}
        {role === "poster" && entry.stage === "awaiting_payout_details" && (
          <p className="font-sans text-[13px] text-bk-body">Win confirmed. Waiting for {entry.entrantName} to share where to send the prize.</p>
        )}
        {role === "poster" && entry.stage === "awaiting_payment" && (
          <PaidForm act={act} busy={busy} prizeType={prizeType} details={entry.payoutDetails} deadline={entry.stageDeadline} owed={entry.paymentOwed} />
        )}
        {role === "poster" && entry.stage === "payment_sent" && (
          <p className="font-sans text-[13px] text-bk-body">Waiting for {entry.entrantName} to confirm they received it.</p>
        )}
        {role === "poster" && entry.stage === "payment_disputed" && !awaitingMyResponse && (
          <p className="font-sans text-[13px] text-bk-body">An admin is reviewing the payment dispute. Your other challenges stay paused until it is settled.</p>
        )}

        {awaitingMyResponse && d && <RespondForm act={act} busy={busy} kind={d.kind} />}
        {error && <p className="mt-3 font-sans text-[12px] text-bk-live">{error}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- forms

function ProofForm({ act, busy, deadline }: { act: Act; busy: boolean; deadline: string | null }) {
  const [matchId, setMatchId] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3">
      <p className="font-sans text-[13px] text-bk-body">
        You were picked. Submit your proof of the win. <When iso={deadline} prefix="Deadline: " />
      </p>
      <input value={matchId} onChange={(e) => setMatchId(e.target.value)} className={field} placeholder="Match / game ID" />
      <UploadSet label="Screenshot" urls={urls} setUrls={setUrls} max={4} folder="challenge-proofs" />
      <p className="font-sans text-[11px] text-bk-muted">Upload the result screen and the match history page — both makes a dispute much less likely.</p>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={area} placeholder="Note (optional)" />
      <button disabled={busy} onClick={() => act("proof", { matchId, proofUrls: urls, note })} className={primary}>Submit proof</button>
    </div>
  );
}

function ReviewForm({ act, busy, deadline }: { act: Act; busy: boolean; deadline: string | null }) {
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  return (
    <div className="space-y-3">
      <p className="font-sans text-[13px] text-bk-body">
        Check the proof above. <When iso={deadline} prefix="Confirm or dispute by " /> — if you don&apos;t respond, it counts as confirmed.
      </p>
      {!disputing ? (
        <div className="flex gap-3">
          <button disabled={busy} onClick={() => act("review-proof", { action: "confirm" })} className={primary}>Confirm the win</button>
          <button disabled={busy} onClick={() => setDisputing(true)} className={danger}>Dispute</button>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={area} placeholder="Why isn't this a valid win? (an admin will read this)" />
          <UploadSet label="Evidence" urls={urls} setUrls={setUrls} max={4} folder="challenge-disputes" />
          <div className="flex gap-3">
            <button disabled={busy} onClick={() => act("review-proof", { action: "dispute", reason, evidenceUrls: urls })} className={danger}>Send dispute</button>
            <button onClick={() => setDisputing(false)} className="font-sans text-[12px] text-bk-muted underline">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailsForm({ act, busy, prizeType, deadline }: { act: Act; busy: boolean; prizeType: string; deadline: string | null }) {
  const [details, setDetails] = useState("");
  return (
    <div className="space-y-3">
      <p className="font-sans text-[13px] text-bk-body">
        Your win is confirmed. Tell the poster where to send the prize. <When iso={deadline} prefix="Please do this by " />
      </p>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={3}
        className={area}
        placeholder={prizeType === "in_game" ? "Your in-game ID / player name and server" : "Bank or wallet name, account number, account holder name"}
      />
      <p className="font-sans text-[11px] text-bk-muted">Only the poster sees this, and it is deleted once the prize is settled.</p>
      <button disabled={busy} onClick={() => act("payout-details", { details })} className={primary}>Send details</button>
    </div>
  );
}

function PaidForm({ act, busy, prizeType, details, deadline, owed }: { act: Act; busy: boolean; prizeType: string; details: string | null; deadline: string | null; owed: boolean }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3">
      {details && (
        <div className="bg-bk-bg border border-bk-border px-3 py-2">
          <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted">Send the prize to</p>
          <p className="font-sans text-[13px] text-bk-heading whitespace-pre-wrap">{details}</p>
        </div>
      )}
      <p className="font-sans text-[13px] text-bk-body">
        {prizeType === "reward" ? "Deliver the reward" : "Send the prize"}, then upload{" "}
        {prizeType === "cash" ? "the receipt (transaction ID, date, amount and the receiver's name must be visible)" : "a screenshot showing it was delivered"}.{" "}
        <When iso={deadline} prefix="Deadline: " />
      </p>
      {owed && <p className="font-sans text-[12px] text-bk-live">An admin ruled this is owed. Your account stays frozen until it is paid.</p>}
      <UploadSet label="Receipt" urls={urls} setUrls={setUrls} max={3} folder="challenge-receipts" />
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={area} placeholder="Transaction ID or note (optional)" />
      <button disabled={busy} onClick={() => act("mark-paid", { receiptUrls: urls, note })} className={primary}>I&apos;ve paid — upload receipt</button>
    </div>
  );
}

function ReportForm({ act, busy, intro }: { act: Act; busy: boolean; intro: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  if (!open) {
    return (
      <p className="font-sans text-[12px] text-bk-body">
        {intro}{" "}
        <button onClick={() => setOpen(true)} className="text-bk-live underline">Report it as not received</button>
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="font-sans text-[12px] text-bk-body">
        This freezes the poster&apos;s other challenges and gives them 24 hours to show proof of payment before an admin decides.
      </p>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={area} placeholder="What happened? Which account did you check?" />
      <UploadSet label="Evidence" urls={urls} setUrls={setUrls} max={4} folder="challenge-disputes" />
      <div className="flex gap-3">
        <button disabled={busy} onClick={() => act("report-not-paid", { reason, evidenceUrls: urls })} className={danger}>Report</button>
        <button onClick={() => setOpen(false)} className="font-sans text-[12px] text-bk-muted underline">Cancel</button>
      </div>
    </div>
  );
}

function RespondForm({ act, busy, kind }: { act: Act; busy: boolean; kind: string }) {
  const [note, setNote] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  return (
    <div className="mt-3 space-y-3 border border-[#EF9F27]/50 p-3">
      <p className="font-sans text-[13px] text-bk-heading">
        {kind === "payment"
          ? "Upload proof that you paid within 24 hours. If you can't, your account can be banned."
          : "Respond with evidence that this was a valid win. An admin will decide after your response."}
      </p>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={area} placeholder="Your response" />
      <UploadSet label={kind === "payment" ? "Proof of payment" : "Evidence"} urls={urls} setUrls={setUrls} max={4} folder="challenge-disputes" />
      <button disabled={busy} onClick={() => act("respond", { note, evidenceUrls: urls })} className={primary}>Send response</button>
    </div>
  );
}
