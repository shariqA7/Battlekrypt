"use client";

// Shown alongside the normal JoinForm when the signed-in user owns or
// captains a club team (or a solo club roster spot) that fits this
// tournament's game/mode. Lets them register — or, before the tournament
// locks, adjust who from the roster is playing.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import SeatsPicker from "@/components/tournaments/SeatsPicker";
import RefundPolicyNote from "@/components/tournaments/RefundPolicyNote";
import { toast } from "@/lib/toast";
import { joinOutcomeMessage, type PublicSeats } from "@/lib/seat-view";
import type { RefundPolicyKey } from "@/lib/seat-settings";

interface Member {
  id: string;
  name: string;
  role: "player" | "substitute";
}
interface TeamOption {
  id: string;
  name: string;
  members: Member[];
  entry: { id: string; memberPlayerIds: string[]; registrationId?: string | null; waitlisted?: boolean } | null;
}
interface Options {
  editable: boolean;
  teams: TeamOption[];
  soloEntry: { playerId: string; alreadyRegistered: boolean } | null;
}

interface EntryTerms {
  entryType: string;
  paymentInstructions: string | null;
  customFields: unknown;
}
interface Field { key: string; label: string; type?: string; required?: boolean; url?: string }

const inputClass = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
const labelClass = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

const primaryBtn =
  "bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-2 px-4 disabled:opacity-50";

export default function ClubEntryPanel({
  tournamentId,
  tournament,
  slug,
  startAt = null,
  seats = null,
  refund,
}: {
  tournamentId: string;
  tournament?: EntryTerms;
  slug?: string;
  startAt?: string | null;
  seats?: PublicSeats | null;
  refund?: { policy: RefundPolicyKey; cutoffHours: number; payWindowMinutes: number };
}) {
  const router = useRouter();
  const [options, setOptions] = useState<Options | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Draft member selection per team, keyed by team id.
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  // What a NEW entry also needs: entry conditions, the organizer's extra fields, and (paid) proof of payment.
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [proofUrl, setProofUrl] = useState("");
  const [reference, setReference] = useState("");
  const [roomId, setRoomId] = useState("");
  const [ackRefund, setAckRefund] = useState(false);
  // Set when the server says a seat opened while this page said "full": payment is needed after all.
  const [seatOpened, setSeatOpened] = useState(false);
  const fields: Field[] = Array.isArray(tournament?.customFields) ? (tournament!.customFields as Field[]) : [];
  const conditions = fields.filter((f) => f.type === "condition");
  const extras = fields.filter((f) => f.type !== "condition");
  const paid = tournament?.entryType === "paid";
  // Every seat taken: a new entry joins the waiting list and pays nothing until a seat opens for it.
  const queueing = !!seats && seats.full && !seatOpened;
  const payNow = paid && !queueing;

  // Returns a message when a new entry can't be sent yet.
  function newEntryProblem(): string | null {
    if (conditions.some((c) => fieldValues[c.key] !== "yes")) return "Tick every entry condition first.";
    if (extras.some((f) => f.required && !(fieldValues[f.key] ?? "").trim())) return "Fill in every required field.";
    if (payNow && !reference.trim()) return "Enter the transaction ID shown on your payment receipt.";
    if (payNow && !proofUrl) return "Upload proof of payment before submitting.";
    if (paid && refund && !ackRefund) return "Please confirm you've read the refund policy.";
    return null;
  }
  const extrasBody = () => ({
    customFieldResponses: fieldValues,
    paymentProofUrl: payNow ? proofUrl || undefined : undefined,
    paymentReference: payNow ? reference.trim() || undefined : undefined,
    roomId: roomId || undefined,
  });

  // After a NEW entry: say where it landed (a seat, another room, or the waiting list).
  function afterNewEntry(json: { entry?: Parameters<typeof joinOutcomeMessage>[0] }) {
    const asked = roomId ? seats?.rooms.find((r) => r.id === roomId) ?? null : null;
    const outcome = joinOutcomeMessage(json.entry, asked, { paid: !!paid });
    toast(outcome.text, outcome.kind);
    if (json.entry?.status === "waitlisted" && slug) router.push(`/tournaments/${slug}`);
    else router.refresh();
  }
  // A seat can open between loading the page and pressing the button: ask for payment then.
  function seatJustOpened(code: string | undefined) {
    if (queueing && (code === "payment_proof_required" || code === "payment_reference_required")) {
      setSeatOpened(true);
      setError("A seat just opened up. Add your payment to take it.");
      return true;
    }
    return false;
  }

  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}/club-entries/options`)
      .then((r) => r.json())
      .then((json) => {
        setOptions(json.data);
        const initial: Record<string, string[]> = {};
        (json.data?.teams ?? []).forEach((t: TeamOption) => {
          initial[t.id] = t.entry?.memberPlayerIds ?? t.members.map((m) => m.id);
        });
        setSelection(initial);
      })
      .catch(() => setOptions(null));
  }, [tournamentId]);

  function toggle(teamId: string, playerId: string) {
    setSelection((prev) => {
      const current = prev[teamId] ?? [];
      const next = current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId];
      return { ...prev, [teamId]: next };
    });
  }

  async function submitTeam(team: TeamOption) {
    if (!team.entry) {
      const problem = newEntryProblem();
      if (problem) return setError(problem);
    }
    setBusy(true);
    setError(null);
    const memberPlayerIds = selection[team.id] ?? [];
    const url = team.entry
      ? `/api/tournaments/${tournamentId}/club-entries/${team.entry.id}`
      : `/api/tournaments/${tournamentId}/club-entries`;
    const res = await fetch(url, {
      method: team.entry ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        team.entry ? { memberPlayerIds } : { teamId: team.id, memberPlayerIds, ...extrasBody() }
      ),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (!seatJustOpened(json?.error?.code)) setError(json?.error?.message ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    setBusy(false);
    if (team.entry) router.refresh();
    else afterNewEntry(json);
  }

  async function submitSolo(playerId: string) {
    const problem = newEntryProblem();
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/club-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, ...extrasBody() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (!seatJustOpened(json?.error?.code)) setError(json?.error?.message ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    setBusy(false);
    afterNewEntry(json);
  }

  if (!options) return null;

  return (
    <div className="bg-bk-surface border border-bk-border p-4 mb-6">
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">
        {options.teams.length > 0 || !options.soloEntry ? "Enter with your team" : "Register your club"}
      </p>
      {!options.editable && (
        <p className="font-sans text-bk-muted text-xs mb-3">
          Registration is no longer open — your organizer can still add or
          change your entry.
        </p>
      )}
      {error && <p className="text-bk-live text-[12px] font-sans mb-2" role="alert">{error}</p>}

      {options.editable && (options.soloEntry ? !options.soloEntry.alreadyRegistered : options.teams.some((t) => !t.entry)) && (
        <div className="mb-4">
          {conditions.length > 0 && (
            <div className="mt-2 border border-bk-border px-3 py-2.5">
              <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-2">Entry conditions</p>
              {conditions.map((c) => (
                <label key={c.key} className="flex items-start gap-2 font-sans text-[13px] text-bk-heading mb-1.5">
                  <input type="checkbox" className="mt-1" checked={fieldValues[c.key] === "yes"}
                    onChange={(e) => setFieldValues((v) => ({ ...v, [c.key]: e.target.checked ? "yes" : "" }))} />
                  <span>
                    {c.label}
                    {c.url && <> <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-bk-gold-light underline">open link</a></>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {extras.map((f) => (
            <div key={f.key}>
              <label className={labelClass}>{f.label}</label>
              <input className={inputClass} value={fieldValues[f.key] ?? ""} required={f.required}
                onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))} />
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
              {tournament?.paymentInstructions && (
                <div className="bg-bk-bg border border-bk-gold-light/40 px-3 py-2.5 mt-4">
                  <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-1">How to pay</p>
                  <p className="font-sans text-[13px] text-bk-heading whitespace-pre-wrap">{tournament.paymentInstructions}</p>
                </div>
              )}
              <label className={labelClass}>Proof of payment</label>
              <FileUpload bucket="payment-proofs" isPrivate ownerFolder pathPrefix="payment-proofs" label="Upload payment screenshot" onUploaded={setProofUrl} />
              <label className={labelClass}>Transaction ID</label>
              <input className={inputClass} value={reference} maxLength={120} autoComplete="off" placeholder="From your payment receipt" onChange={(e) => setReference(e.target.value)} />
            </>
          )}
          {paid && refund && (
            <div className="mt-5">
              <RefundPolicyNote policy={refund.policy} cutoffHours={refund.cutoffHours} payWindowMinutes={seats?.waitlistEnabled ? refund.payWindowMinutes : undefined} />
              <label className="flex items-start gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={ackRefund} onChange={(e) => setAckRefund(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0" />
                <span className="font-sans text-[13px] text-bk-body">I&apos;ve read the refund policy and agree to it.</span>
              </label>
            </div>
          )}
        </div>
      )}

      {options.soloEntry && (
        <button
          type="button"
          disabled={busy || options.soloEntry.alreadyRegistered || !options.editable}
          onClick={() => submitSolo(options.soloEntry!.playerId)}
          className={primaryBtn}
        >
          {options.soloEntry.alreadyRegistered ? "Already registered" : queueing ? "Join the waiting list" : "Register this player"}
        </button>
      )}

      {options.teams.map((t) => (
        <div key={t.id} className="border-t border-bk-border pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
          <p className="font-sans text-bk-heading text-sm mb-2">{t.name}</p>
          {t.entry?.waitlisted && (
            <p className="font-sans text-[12px] text-bk-gold-light mb-2">On the waiting list. See the tournament page for your place in line.</p>
          )}
          <div className="flex flex-col gap-1.5 mb-3">
            {t.members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 font-sans text-[13px] text-bk-body">
                <input
                  type="checkbox"
                  checked={(selection[t.id] ?? []).includes(m.id)}
                  onChange={() => toggle(t.id, m.id)}
                  disabled={!options.editable}
                />
                {m.name}
                {m.role === "substitute" && (
                  <span className="text-[10px] uppercase tracking-[0.5px] text-bk-gold-light">
                    Sub
                  </span>
                )}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || !options.editable || (selection[t.id] ?? []).length === 0}
            onClick={() => submitTeam(t)}
            className={primaryBtn}
          >
            {t.entry ? "Update lineup" : queueing ? "Join the waiting list with this team" : "Enter this team"}
          </button>
        </div>
      ))}
    </div>
  );
}
