"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PrizeSplitEditor, { prizeRowsToBody, prizeRowsFromTiers, type PrizeRow } from "@/components/tournaments/PrizeSplitEditor";
import PrizeAwardsEditor, { awardRowsToBody, awardRowsFromAwards, type AwardRow } from "@/components/tournaments/PrizeAwardsEditor";
import { awardsCash } from "@/lib/prize-awards";
import type { FeatureFlags } from "@/lib/feature-flags-shared";

interface RequestRow {
  id: string;
  kind: string;
  details: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
}

const KIND_LABEL: Record<string, string> = {
  prize_pool: "Change the prize pool, places or awards",
  cancel: "Cancel the event",
  conditions: "Change the entry conditions",
  other: "Something else",
};

export default function ChangeRequestPanel({
  tournamentId,
  locked,
  hasPrize,
  prizeCurrency,
  currentPool,
  currentTiers,
  currentAwards,
  currentConditions,
  requests,
  refundsDueAt,
  flags,
}: {
  tournamentId: string;
  locked: boolean;
  hasPrize: boolean;
  prizeCurrency: string;
  currentPool: number;
  currentTiers: { positionFrom: number; positionTo: number; amount: unknown }[];
  currentAwards: { name: string; cashAmount: unknown; prizeText: string | null }[];
  currentConditions: string;
  requests: RequestRow[];
  refundsDueAt: string | null;
  flags: FeatureFlags;
}) {
  const router = useRouter();
  const [kind, setKind] = useState(hasPrize ? "prize_pool" : "conditions");
  const [details, setDetails] = useState("");
  const [amount, setAmount] = useState(currentPool > 0 ? String(currentPool) : "");
  const [prizeRows, setPrizeRows] = useState<PrizeRow[]>(prizeRowsFromTiers(currentTiers));
  const [awardRows, setAwardRows] = useState<AwardRow[]>(awardRowsFromAwards(currentAwards));
  const [conditions, setConditions] = useState(currentConditions);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const box = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2";

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/change-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        details,
        prizeStructure:
          kind === "prize_pool"
            ? { amount: Number(amount), tiers: prizeRowsToBody(prizeRows), awards: awardRowsToBody(awardRows) }
            : undefined,
        conditionsText: conditions,
      }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    setDetails("");
    router.refresh();
  }

  async function confirmRefunds() {
    if (!confirm("Confirm you have refunded every player who paid an entry fee for this cancelled event?")) return;
    setBusy(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/confirm-refunds`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError("Couldn't confirm.");
  }

  return (
    <div className="bg-bk-surface border border-bk-border p-4 mb-6">
      {refundsDueAt && (
        <div className="bg-bk-live/[0.12] text-bk-live font-sans text-[12px] px-3 py-2 mb-3">
          This event was cancelled with admin approval. Refund every paid player directly, then confirm by{" "}
          {new Date(refundsDueAt).toLocaleDateString("en-GB")}. Until you do, you can&apos;t host new paid or prized events.
          <button type="button" onClick={confirmRefunds} disabled={busy} className="block mt-2 underline uppercase tracking-[0.8px] text-[11px]">
            I&apos;ve refunded everyone
          </button>
        </div>
      )}

      {locked && (
        <>
          <p className="font-sans text-[13px] text-bk-heading font-bold mb-1">Locked: players have registered</p>
          <p className="font-sans text-[12px] text-bk-body mb-3">
            For paid or prized events, the prize pool, cancellation, rules and entry conditions can&apos;t change on
            your own once players have joined. Ask an admin; if they approve it, the change is applied and every
            registered player is told.
          </p>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${box} h-[38px] mb-2`}>
            {Object.entries(KIND_LABEL)
              .filter(([k]) => k !== "prize_pool" || hasPrize)
              .filter(([k]) => k !== "conditions" || flags.entryConditions || currentConditions.trim().length > 0)
              .map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
          </select>
          {kind === "prize_pool" && (
            <>
              <label className="block font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-1">
                New prize pool ({prizeCurrency})
              </label>
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${box} h-[38px] mb-1`} />
              <PrizeSplitEditor
                rows={prizeRows}
                onChange={setPrizeRows}
                poolAmount={Number(amount) || 0}
                currency={prizeCurrency}
                awardsCash={awardsCash(awardRowsToBody(awardRows))}
              />
              {(flags.specialAwards || awardRows.length > 0) && (
                <PrizeAwardsEditor rows={awardRows} onChange={setAwardRows} currency={prizeCurrency} />
              )}
              <p className="font-sans text-[11px] text-bk-muted mt-2 mb-2">
                Send the complete new prize structure. If an admin approves it, it replaces the old one and every registered player is told.
              </p>
            </>
          )}
          {kind === "conditions" && (
            <>
              <textarea rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} className={`${box} mb-1`} />
              <p className="font-sans text-[11px] text-bk-muted mb-2">The full new list, one per line, optional link after a |.</p>
            </>
          )}
          <textarea rows={3} maxLength={1500} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Why do you need this change? (shown to the admin)" className={box} />
          {error && <p className="text-bk-live text-[12px] font-sans mt-2">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={busy || details.trim().length < 10}
            className="mt-2 bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50"
          >
            Send to admin
          </button>
        </>
      )}

      {requests.length > 0 && (
        <div className={locked ? "mt-4 border-t border-bk-border pt-3" : ""}>
          <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-2">Your requests</p>
          {requests.map((r) => (
            <p key={r.id} className="font-sans text-[12px] text-bk-body mb-1">
              <span className="text-bk-heading">{KIND_LABEL[r.kind] ?? r.kind}</span> ·{" "}
              <span className={r.status === "approved" ? "text-bk-teal" : r.status === "denied" ? "text-bk-live" : "text-bk-amber"}>{r.status}</span>
              {r.adminNote ? ` — ${r.adminNote}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
