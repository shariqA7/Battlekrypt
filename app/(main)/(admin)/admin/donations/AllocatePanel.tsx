"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SearchPicker from "@/components/admin/SearchPicker";
import { buttonClass } from "@/components/ui/Button";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import type { TournamentHit } from "@/lib/services/admin-lists";

const input = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[40px]";
const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1 mt-3";

export default function AllocatePanel({ campaigns }: { campaigns: { id: string; title: string; currency: string }[] }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [purpose, setPurpose] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [tournament, setTournament] = useState<TournamentHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/fund-allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount), currency, purpose, campaignId: campaignId || undefined, tournamentId: tournament?.id }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    setAmount("");
    setPurpose("");
    setTournament(null);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border border-bk-border bg-bk-surface p-4">
      <p className="font-sans font-bold text-[13px] text-bk-heading">Record a use of the fund</p>
      <p className="font-sans text-[12px] text-bk-muted">This doesn&apos;t move any money. It records what you paid out so the public ledger and the balance stay true.</p>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <div>
          <label htmlFor="a-amount" className={label}>Amount</label>
          <input id="a-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="a-cur" className={label}>Currency</label>
          <select id="a-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className={input}>
            {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <label htmlFor="a-purpose" className={label}>What was it used for?</label>
      <input id="a-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={200} className={input} placeholder="Ramadan Cup prize pool" />
      <label htmlFor="a-camp" className={label}>From a campaign (optional)</label>
      <select id="a-camp" value={campaignId} onChange={(e) => { setCampaignId(e.target.value); const c = campaigns.find((x) => x.id === e.target.value); if (c) setCurrency(c.currency); }} className={input}>
        <option value="">General fund</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.currency})</option>)}
      </select>
      <p className={label}>Toward a tournament (optional)</p>
      {tournament ? (
        <p className="font-sans text-[13px] text-bk-heading">
          {tournament.name} <span className="text-bk-muted">· {tournament.organizer}</span>{" "}
          <button type="button" onClick={() => setTournament(null)} className="text-bk-gold-light underline text-[11px] uppercase">Change</button>
        </p>
      ) : (
        <SearchPicker<TournamentHit>
          endpoint="/api/admin/donations/tournaments"
          label="Find a tournament"
          placeholder="Search tournament or organizer"
          onPick={setTournament}
          renderItem={(t) => (
            <span className="block">
              <span className="block font-sans text-[13px] text-bk-heading truncate">{t.name}</span>
              <span className="block font-sans text-[11px] text-bk-muted truncate">{t.organizer} · {t.status.replace(/_/g, " ")}</span>
            </span>
          )}
        />
      )}
      {error && <p role="alert" className="text-bk-live text-[12px] font-sans mt-3">{error}</p>}
      {saved && <p role="status" className="text-bk-teal text-[12px] font-sans mt-3">Recorded.</p>}
      <button type="submit" disabled={busy} className={`${buttonClass("primary", "md")} mt-4`}>{busy ? "Saving…" : "Record"}</button>
    </form>
  );
}
