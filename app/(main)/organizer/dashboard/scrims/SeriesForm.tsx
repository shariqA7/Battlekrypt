"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import { Panel } from "@/components/ui/Panel";
import { LAUNCH_CURRENCIES } from "@/lib/money";
import { DAY_NAMES, SERIES_TIMEZONES, describeSchedule } from "@/lib/scrim-series-rules";

const input = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";
const today = () => new Date().toISOString().slice(0, 10);
type Game = { id: string; name: string };

export default function SeriesForm({ maxSlots, maxDays, onDone }: { maxSlots: number | null; maxDays: number | null; onDone?: () => void }) {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [f, setF] = useState({
    name: "", description: "", bannerUrl: "", gameId: "", mode: "squad", maxTeamSize: "4", maxTeams: "20", playersPerRoom: "",
    entryType: "free", entryFeeAmount: "", entryFeeCurrency: "PKR", paymentInstructions: "", rulesText: "",
    timezone: "Asia/Karachi", startDate: today(), endDate: "", nonStop: false,
  });
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [slots, setSlots] = useState<string[]>(["20:00"]);
  const [skip, setSkip] = useState<string[]>([]);
  const [skipInput, setSkipInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/games").then((r) => r.json()).then((d) => setGames(d.data ?? [])).catch(() => setGames([]));
  }, []);

  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const toggleDay = (d: number) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
  const canAddSlot = maxSlots === null || slots.length < maxSlots;

  async function submit() {
    setBusy(true); setError(null);
    const res = await fetch("/api/organizer/scrim-series", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...f, maxTeamSize: f.mode === "squad" ? Number(f.maxTeamSize) : undefined, daysOfWeek: days, slotTimes: slots, skipDates: skip,
        endDate: f.nonStop ? null : f.endDate || null, entryFeeAmount: f.entryType === "paid" ? f.entryFeeAmount : undefined,
        entryFeeCurrency: f.entryType === "paid" ? f.entryFeeCurrency : undefined, playersPerRoom: f.playersPerRoom || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    onDone?.();
    router.refresh();
  }

  const preview = days.length && slots.length ? describeSchedule({ daysOfWeek: days, slotTimes: slots }) : null;

  return (
    <Panel className="p-5 mb-6">
      <p className="font-sans font-bold text-bk-heading text-[15px] mb-1">New recurring scrim series</p>
      <p className="font-sans text-[12px] text-bk-muted">Set it up once. We create each day&apos;s scrim automatically, about two weeks ahead, each with its own room and sign-ups.</p>

      <label className={label}>Name</label>
      <input className={input} value={f.name} maxLength={80} onChange={(e) => set("name", e.target.value)} placeholder="Night Scrims" />
      <label className={label}>Description (optional)</label>
      <textarea className={`${input} h-24 py-2`} value={f.description} maxLength={2000} onChange={(e) => set("description", e.target.value)} />
      <label className={label}>Banner (optional)</label>
      <div className="flex items-center gap-3">
        {f.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.bannerUrl} alt="" className="h-12 border border-bk-border" />
        )}
        <FileUpload bucket="tournament-assets" pathPrefix="series" preset="photo" label={f.bannerUrl ? "Replace banner" : "Upload banner"} onUploaded={(u) => set("bannerUrl", u)} />
      </div>

      <div className="grid sm:grid-cols-3 gap-x-4">
        <div><label className={label}>Game</label>
          <select className={input} value={f.gameId} onChange={(e) => set("gameId", e.target.value)}>
            <option value="">Choose…</option>{games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select></div>
        <div><label className={label}>Mode</label>
          <select className={input} value={f.mode} onChange={(e) => set("mode", e.target.value)}>
            <option value="solo">Solo</option><option value="duo">Duo</option><option value="squad">Squad</option>
          </select></div>
        {f.mode === "squad" && <div><label className={label}>Players per squad</label><input type="number" min={3} max={6} className={input} value={f.maxTeamSize} onChange={(e) => set("maxTeamSize", e.target.value)} /></div>}
        <div><label className={label}>Capacity (teams or players)</label><input type="number" min={2} max={500} className={input} value={f.maxTeams} onChange={(e) => set("maxTeams", e.target.value)} /></div>
        <div><label className={label}>Players per room (optional)</label><input type="number" min={2} className={input} value={f.playersPerRoom} onChange={(e) => set("playersPerRoom", e.target.value)} /></div>
      </div>
      {f.mode !== "solo" && <p className="font-sans text-[11px] text-bk-muted mt-2">Team games are entered through a club team.</p>}

      <p className="font-sans font-bold text-bk-heading text-[13px] mt-6">When does it run?</p>
      <label className={label}>Days</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {[["Every day", [0, 1, 2, 3, 4, 5, 6]], ["Weekdays", [1, 2, 3, 4, 5]], ["Weekends", [0, 6]]].map(([t, v]) => (
          <button key={t as string} type="button" onClick={() => setDays(v as number[])} className="border border-bk-border text-bk-body font-sans text-[12px] px-3 h-[30px]">{t as string}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {DAY_NAMES.map((n, i) => (
          <label key={n} className="flex items-center gap-1.5 font-sans text-[13px] text-bk-body"><input type="checkbox" checked={days.includes(i)} onChange={() => toggleDay(i)} /> {n.slice(0, 3)}</label>
        ))}
      </div>
      <label className={label}>Start times{maxSlots !== null ? ` (up to ${maxSlots} per day on your plan)` : ""}</label>
      <div className="flex flex-wrap items-center gap-2">
        {slots.map((t, i) => (
          <span key={i} className="flex items-center gap-1">
            <input type="time" className={`${input} !w-[130px]`} value={t} onChange={(e) => setSlots((s) => s.map((x, j) => (j === i ? e.target.value : x)))} />
            {slots.length > 1 && <button type="button" aria-label="Remove time" onClick={() => setSlots((s) => s.filter((_, j) => j !== i))} className="text-bk-muted px-1">×</button>}
          </span>
        ))}
        {canAddSlot && <button type="button" onClick={() => setSlots((s) => [...s, "22:00"])} className="border border-bk-border text-bk-body font-sans text-[12px] px-3 h-[34px]">+ Add a time</button>}
      </div>
      <div className="grid sm:grid-cols-3 gap-x-4">
        <div><label className={label}>Time zone</label>
          <select className={input} value={f.timezone} onChange={(e) => set("timezone", e.target.value)}>{SERIES_TIMEZONES.map((z) => <option key={z}>{z}</option>)}</select></div>
        <div><label className={label}>Starts</label><input type="date" min={today()} className={input} value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></div>
        <div><label className={label}>Ends</label><input type="date" className={input} disabled={f.nonStop} value={f.endDate} onChange={(e) => set("endDate", e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 font-sans text-[13px] text-bk-body mt-3">
        <input type="checkbox" checked={f.nonStop} onChange={(e) => set("nonStop", e.target.checked)} disabled={maxDays !== null} />
        Run non-stop (no end date){maxDays !== null && <span className="text-bk-muted"> — not on your plan (up to {maxDays} days)</span>}
      </label>
      <label className={label}>Days off (optional)</label>
      <div className="flex flex-wrap items-center gap-2">
        {skip.map((d) => <button key={d} type="button" onClick={() => setSkip((s) => s.filter((x) => x !== d))} className="border border-bk-border text-bk-body font-mono text-[12px] px-2 h-[28px]">{d} ×</button>)}
        <input type="date" className={`${input} !w-[160px]`} value={skipInput} onChange={(e) => setSkipInput(e.target.value)} />
        <button type="button" onClick={() => { if (skipInput && !skip.includes(skipInput)) setSkip((s) => [...s, skipInput]); setSkipInput(""); }} className="border border-bk-border text-bk-body font-sans text-[12px] px-3 h-[34px]">Add</button>
      </div>
      {preview && <p className="font-sans text-[13px] text-bk-gold-light mt-3">{preview}</p>}

      <p className="font-sans font-bold text-bk-heading text-[13px] mt-6">Entry</p>
      <div className="grid sm:grid-cols-3 gap-x-4">
        <div><label className={label}>Entry</label>
          <select className={input} value={f.entryType} onChange={(e) => set("entryType", e.target.value)}><option value="free">Free</option><option value="paid">Paid (per session)</option></select></div>
        {f.entryType === "paid" && <>
          <div><label className={label}>Fee per session</label><input type="number" min={1} className={input} value={f.entryFeeAmount} onChange={(e) => set("entryFeeAmount", e.target.value)} /></div>
          <div><label className={label}>Currency</label><select className={input} value={f.entryFeeCurrency} onChange={(e) => set("entryFeeCurrency", e.target.value)}>{LAUNCH_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        </>}
      </div>
      {f.entryType === "paid" && <>
        <label className={label}>How should players pay?</label>
        <textarea className={`${input} h-20 py-2`} value={f.paymentInstructions} maxLength={1000} onChange={(e) => set("paymentInstructions", e.target.value)} placeholder="Easypaisa / JazzCash number, bank details…" />
      </>}
      <label className={label}>Rules (one per line, optional)</label>
      <textarea className={`${input} h-24 py-2`} value={f.rulesText} maxLength={4000} onChange={(e) => set("rulesText", e.target.value)} />

      {error && <p className="text-bk-live text-[12px] font-sans mt-4" role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={submit} className="mt-5 bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-5 py-3 disabled:opacity-50">
        {busy ? "Creating…" : "Create series"}
      </button>
    </Panel>
  );
}
