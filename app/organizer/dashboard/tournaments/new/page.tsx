"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/layout/Nav";
import CurrencyInput from "@/components/ui/CurrencyInput";
import FileUpload from "@/components/ui/FileUpload";

interface Game {
  id: string;
  name: string;
}

export default function NewTournamentPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [gameId, setGameId] = useState("");
  const [name, setName] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [type, setType] = useState("tournament");
  const [mode, setMode] = useState("squad");
  const [maxTeams, setMaxTeams] = useState(64);
  const [playersPerRoom, setPlayersPerRoom] = useState(100);
  const [entryType, setEntryType] = useState<"free" | "paid">("free");
  const [entryFeeAmount, setEntryFeeAmount] = useState(0);
  const [entryFeeCurrency, setEntryFeeCurrency] = useState("PKR");
  const [prizePoolAmount, setPrizePoolAmount] = useState(0);
  const [prizePoolCurrency, setPrizePoolCurrency] = useState("PKR");
  const [rulesText, setRulesText] = useState("");

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json())
      .then((data) => setGames(data.data ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        name,
        bannerUrl: bannerUrl || undefined,
        type,
        mode,
        maxTeams: Number(maxTeams),
        playersPerRoom: Number(playersPerRoom),
        format: "single_elimination",
        entryType,
        entryFee: entryType === "paid" ? { amount: entryFeeAmount, currency: entryFeeCurrency } : undefined,
        prizePool: prizePoolAmount > 0 ? { amount: prizePoolAmount, currency: prizePoolCurrency } : undefined,
        rules: rulesText.split("\n").map((r) => r.trim()).filter(Boolean),
      }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }

    const tournament = await res.json();
    router.push(`/tournaments/${tournament.id}`);
  }

  const inputClass =
    "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
  const labelClass =
    "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

  return (
    <>
      <Nav />
      <main className="flex-1 px-6 py-10 max-w-lg mx-auto w-full">
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">
          New tournament
        </h1>
        <p className="font-sans text-bk-body text-sm mb-6">
          Creates a draft — you can publish it once it&apos;s ready.
        </p>

        <form onSubmit={handleSubmit}>
          <label className={labelClass}>Game</label>
          <select
            required
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a game</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <label className={labelClass}>Banner image (optional)</label>
          <FileUpload
            bucket="tournament-assets"
            pathPrefix="banners"
            label="Upload a banner"
            onUploaded={setBannerUrl}
          />

          <label className={labelClass}>Tournament name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="PUBGM Squad Cup"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
                <option value="tournament">Tournament</option>
                <option value="league">League</option>
                <option value="scrim">Scrim</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
                <option value="solo">Solo</option>
                <option value="duo">Duo</option>
                <option value="squad">Squad</option>
              </select>
            </div>
          </div>

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

          <label className={labelClass}>Entry</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEntryType("free")}
              className={`flex-1 h-[38px] text-[12px] font-sans uppercase tracking-[0.5px] ${entryType === "free" ? "bg-bk-gold-light text-bk-bg" : "bg-bk-surface text-bk-body border border-bk-border"
                }`}
            >
              Free
            </button>
            <button
              type="button"
              onClick={() => setEntryType("paid")}
              className={`flex-1 h-[38px] text-[12px] font-sans uppercase tracking-[0.5px] ${entryType === "paid" ? "bg-bk-gold-light text-bk-bg" : "bg-bk-surface text-bk-body border border-bk-border"
                }`}
            >
              Paid
            </button>
          </div>

          {entryType === "paid" && (
            <>
              <label className={labelClass}>Entry fee</label>
              <CurrencyInput
                amount={entryFeeAmount}
                currency={entryFeeCurrency}
                onChange={(amount, currency) => {
                  setEntryFeeAmount(amount);
                  setEntryFeeCurrency(currency);
                }}
              />
            </>
          )}

          <label className={labelClass}>Prize pool (optional)</label>
          <CurrencyInput
            amount={prizePoolAmount}
            currency={prizePoolCurrency}
            onChange={(amount, currency) => {
              setPrizePoolAmount(amount);
              setPrizePoolCurrency(currency);
            }}
          />

          <label className={labelClass}>Rules (one per line)</label>
          <textarea
            value={rulesText}
            onChange={(e) => setRulesText(e.target.value)}
            rows={4}
            className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2"
            placeholder={"No emulator use\n10 minute check-in window"}
          />

          {error && <p className="text-bk-live text-[12px] font-sans mt-4">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 mt-6 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create draft"}
          </button>
        </form>
      </main>
    </>
  );
}
