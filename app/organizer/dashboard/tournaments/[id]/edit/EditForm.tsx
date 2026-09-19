"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CurrencyInput from "@/components/ui/CurrencyInput";

interface TournamentForEdit {
  id: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  maxTeams: number;
  playersPerRoom: number | null;
  entryType: string;
  entryFeeAmount: unknown; // Prisma Decimal — coerced with Number() below
  entryFeeCurrency: string | null;
  prizePoolAmount: unknown;
  prizePoolCurrency: string | null;
  startAt: Date | null;
}

export default function EditForm({ tournament }: { tournament: TournamentForEdit }) {
  const router = useRouter();
  const [name, setName] = useState(tournament.name);
  const [description, setDescription] = useState(tournament.description ?? "");
  const [bannerUrl, setBannerUrl] = useState(tournament.bannerUrl ?? "");
  const [maxTeams, setMaxTeams] = useState(tournament.maxTeams);
  const [playersPerRoom, setPlayersPerRoom] = useState(tournament.playersPerRoom ?? 0);
  const [entryFeeAmount, setEntryFeeAmount] = useState(
    tournament.entryFeeAmount ? Number(tournament.entryFeeAmount) : 0
  );
  const [entryFeeCurrency, setEntryFeeCurrency] = useState(tournament.entryFeeCurrency ?? "PKR");
  const [prizePoolAmount, setPrizePoolAmount] = useState(
    tournament.prizePoolAmount ? Number(tournament.prizePoolAmount) : 0
  );
  const [prizePoolCurrency, setPrizePoolCurrency] = useState(tournament.prizePoolCurrency ?? "PKR");
  const [startAt, setStartAt] = useState(
    tournament.startAt ? new Date(tournament.startAt).toISOString().slice(0, 16) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/tournaments/${tournament.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        bannerUrl: bannerUrl || undefined,
        maxTeams: Number(maxTeams),
        playersPerRoom: Number(playersPerRoom),
        startAt: startAt ? new Date(startAt).toISOString() : undefined,
        ...(tournament.entryType === "paid" && {
          entryFee: { amount: entryFeeAmount, currency: entryFeeCurrency },
        }),
        ...(prizePoolAmount > 0 && {
          prizePool: { amount: prizePoolAmount, currency: prizePoolCurrency },
        }),
      }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }

    router.push(`/organizer/dashboard/tournaments/${tournament.id}`);
  }

  const inputClass =
    "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
  const labelClass =
    "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

  return (
    <form onSubmit={handleSubmit}>
      <label className={labelClass}>Tournament name</label>
      <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />

      <label className={labelClass}>Description</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2"
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Max teams</label>
          <input
            type="number"
            required
            value={maxTeams}
            onChange={(e) => setMaxTeams(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Players per room</label>
          <input
            type="number"
            value={playersPerRoom}
            onChange={(e) => setPlayersPerRoom(Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </div>

      <label className={labelClass}>Start date &amp; time</label>
      <input
        type="datetime-local"
        value={startAt}
        onChange={(e) => setStartAt(e.target.value)}
        className={inputClass}
      />

      {tournament.entryType === "paid" && (
        <>
          <label className={labelClass}>Entry fee</label>
          <CurrencyInput
            amount={entryFeeAmount}
            currency={entryFeeCurrency}
            onChange={(a, c) => {
              setEntryFeeAmount(a);
              setEntryFeeCurrency(c);
            }}
          />
        </>
      )}

      <label className={labelClass}>Prize pool</label>
      <CurrencyInput
        amount={prizePoolAmount}
        currency={prizePoolCurrency}
        onChange={(a, c) => {
          setPrizePoolAmount(a);
          setPrizePoolCurrency(c);
        }}
      />

      {error && <p className="text-bk-live text-[12px] font-sans mt-4">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 mt-6 disabled:opacity-50"
      >
        {submitting ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
