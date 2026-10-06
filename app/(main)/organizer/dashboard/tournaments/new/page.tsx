"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import CurrencyInput from "@/components/ui/CurrencyInput";
import FileUpload from "@/components/ui/FileUpload";
import RulesEditor, { type EditableRule } from "@/components/tournaments/RulesEditor";
import TierPicker, { type CompetitiveTierValue } from "@/components/tournaments/TierPicker";
import CountryPicker from "@/components/tournaments/CountryPicker";
import VenuePicker, { emptyVenue, venueToBody, type VenueValue } from "@/components/tournaments/VenuePicker";
import AudiencePicker, { type AudienceScopeValue } from "@/components/tournaments/AudiencePicker";

interface Game {
  id: string;
  name: string;
}

interface TemplateSummary {
  id: string;
  name: string;
  game: { name: string };
}

export default function NewTournamentPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [gameId, setGameId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [type, setType] = useState("tournament");
  const [mode, setMode] = useState("squad");
  const [maxTeamSize, setMaxTeamSize] = useState(4);
  const [maxTeams, setMaxTeams] = useState(64);
  const [playersPerRoom, setPlayersPerRoom] = useState(100);
  const [format, setFormat] = useState("single_elimination");
  const [startAt, setStartAt] = useState("");
  const [entryType, setEntryType] = useState<"free" | "paid">("free");
  const [entryFeeAmount, setEntryFeeAmount] = useState(0);
  const [entryFeeCurrency, setEntryFeeCurrency] = useState("PKR");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [prizePoolAmount, setPrizePoolAmount] = useState(0);
  const [prizePoolCurrency, setPrizePoolCurrency] = useState("PKR");
  const [competitiveTier, setCompetitiveTier] = useState<CompetitiveTierValue>("none");
  const [venue, setVenue] = useState<VenueValue>(emptyVenue);
  // "__default" = leave it to the server (the organizer's own country).
  const [country, setCountry] = useState("__default");
  const [audienceScope, setAudienceScope] = useState<AudienceScopeValue>("open");
  const [freshProof, setFreshProof] = useState(false);
  const [rules, setRules] = useState<EditableRule[]>([]);
  const [customFields, setCustomFields] = useState<
    { key: string; label: string; type: string; required: boolean }[]
  >([]);
  // Stage NAMES pulled from a template — instance details (date, room) still
  // get added on the tournament page afterward, same as any manually-created
  // stage. Created right after the tournament itself, in handleSubmit.
  const [pendingStageNames, setPendingStageNames] = useState<string[]>([]);

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateError, setTemplateError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json())
      .then((data) => setGames(data.data ?? []));
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => setTemplates(data.data ?? []))
      .catch(() => setTemplates([]));
  }, []);

  async function applyTemplate(id: string) {
    setTemplateId(id);
    setTemplateError(null);
    if (!id) return;

    const res = await fetch(`/api/templates/${id}`);
    if (!res.ok) {
      setTemplateError((await res.json()).error.message);
      return;
    }
    const t = await res.json();

    setGameId(t.gameId);
    setType(t.type);
    setMode(t.mode);
    if (t.maxTeamSize) setMaxTeamSize(t.maxTeamSize);
    setMaxTeams(t.maxTeams);
    if (t.playersPerRoom) setPlayersPerRoom(t.playersPerRoom);
    setFormat(t.format);
    setEntryType(t.entryType);
    if (t.entryFee) {
      setEntryFeeAmount(t.entryFee.amount);
      setEntryFeeCurrency(t.entryFee.currency);
    }
    setPaymentInstructions(t.paymentInstructions ?? "");
    if (t.prizePool) {
      setPrizePoolAmount(t.prizePool.amount);
      setPrizePoolCurrency(t.prizePool.currency);
    }
    if (t.audienceScope === "institution") {
      setAudienceScope("institution");
      setFreshProof(!!t.requireFreshInstitutionProof);
    } else {
      setAudienceScope("open");
      setFreshProof(false);
    }
    // Only the kind of venue comes from a template; the address and check-in
    // times belong to one specific event.
    setVenue({ ...emptyVenue, venueType: t.venueType === "lan" || t.venueType === "hybrid" ? t.venueType : "online" });
    if (Array.isArray(t.customFields)) setCustomFields(t.customFields);
    setRules(
      t.rules.map((r: EditableRule) => ({
        title: r.title,
        description: r.description,
        action: r.action,
        penaltyPoints: r.penaltyPoints,
        suggestedRuleId: r.suggestedRuleId,
      }))
    );
    setPendingStageNames(t.stageNames ?? []);
    // Name, description, banner and start time are instance-specific — left
    // for the organizer to fill in themselves, same as the spec's "organizer
    // only edits what changed" (§5).
  }

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
        description: description || undefined,
        bannerUrl: bannerUrl || undefined,
        type,
        mode,
        maxTeamSize: mode !== "solo" ? Number(maxTeamSize) : undefined,
        maxTeams: Number(maxTeams),
        playersPerRoom: Number(playersPerRoom),
        format,
        startAt: startAt ? new Date(startAt).toISOString() : undefined,
        entryType,
        entryFee: entryType === "paid" ? { amount: entryFeeAmount, currency: entryFeeCurrency } : undefined,
        paymentInstructions: entryType === "paid" ? paymentInstructions.trim() || undefined : undefined,
        prizePool: prizePoolAmount > 0 ? { amount: prizePoolAmount, currency: prizePoolCurrency } : undefined,
        competitiveTier,
        ...venueToBody(venue),
        country: country === "__default" ? undefined : country,
        audienceScope,
        requireFreshInstitutionProof: audienceScope === "institution" && freshProof,
        customFields: customFields.length > 0 ? customFields : undefined,
        rules: rules.map((r) => ({
          title: r.title,
          description: r.description,
          action: r.action,
          penaltyPoints: r.penaltyPoints,
          suggestedRuleId: r.suggestedRuleId,
        })),
      }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }

    const tournament = await res.json();

    // Stage NAMES from a template are added one at a time via the existing
    // stages endpoint — there's no bulk-create route, and this mirrors doing
    // it by hand on the tournament page afterward. Best-effort: a failure
    // here shouldn't block navigating to the tournament that was already
    // created successfully.
    for (const stageName of pendingStageNames) {
      await fetch(`/api/tournaments/${tournament.id}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: stageName }),
      }).catch(() => {});
    }
    router.push(`/tournaments/${tournament.slug}`);
  }

  const inputClass =
    "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
  const labelClass =
    "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

  return (
    <>
      <main className="flex-1 px-6 py-10 max-w-lg mx-auto w-full">
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">
          New tournament
        </h1>
        <p className="font-sans text-bk-body text-sm mb-6">
          Creates a draft — you can publish it once it&apos;s ready.
        </p>

        {templates.length > 0 && (
          <div className="bg-bk-surface border border-bk-border p-3 mb-5">
            <label className={labelClass}>Start from a template</label>
            <select
              value={templateId}
              onChange={(e) => void applyTemplate(e.target.value)}
              className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]"
            >
              <option value="">Start from scratch</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.game.name})
                </option>
              ))}
            </select>
            {templateId && (
              <p className="font-sans text-bk-muted text-[12px] mt-1.5">
                Pre-filled below — the name, description, banner and start time are still
                yours to set.
              </p>
            )}
            {templateError && (
              <p className="text-bk-live text-[12px] font-sans mt-1.5">{templateError}</p>
            )}
          </div>
        )}

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
          <a
            href="/organizer/dashboard/games"
            className="text-bk-gold-light text-[11px] font-sans underline mt-1.5 inline-block"
          >
            Don&apos;t see your game? Request it
          </a>

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

          <label className={labelClass}>Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2"
            placeholder="What players should know before joining"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          {mode !== "solo" && (
            <>
              <label className={labelClass}>Team size</label>
              <input
                type="number"
                min={2}
                value={maxTeamSize}
                onChange={(e) => setMaxTeamSize(Number(e.target.value))}
                className={inputClass}
                placeholder="e.g. 4 for a squad"
              />
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value)} className={inputClass}>
                <option value="single_elimination">Single elimination</option>
                <option value="double_elimination">Double elimination</option>
                <option value="round_robin">Round robin</option>
                <option value="points_table">Points table</option>
                <option value="league_format">League</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Start date &amp; time</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <label className={labelClass}>Custom registration fields (optional)</label>
          <div className="flex flex-col gap-2">
            {customFields.map((field, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={field.label}
                  onChange={(e) => {
                    const next = [...customFields];
                    next[i] = {
                      ...next[i],
                      label: e.target.value,
                      key: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                    };
                    setCustomFields(next);
                  }}
                  placeholder="e.g. In-game UID"
                  className={inputClass + " flex-1"}
                />
                <label className="flex items-center gap-1.5 text-[11px] font-sans text-bk-body whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => {
                      const next = [...customFields];
                      next[i] = { ...next[i], required: e.target.checked };
                      setCustomFields(next);
                    }}
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => setCustomFields(customFields.filter((_, idx) => idx !== i))}
                  className="text-bk-live text-[16px] px-1"
                  aria-label="Remove field"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setCustomFields([...customFields, { key: "", label: "", type: "text", required: false }])
              }
              className="bg-bk-surface border border-bk-border text-bk-body font-sans text-[11px] uppercase tracking-[0.5px] px-3 py-2 self-start"
            >
              + Add field
            </button>
          </div>

          <label className={labelClass}>Entry</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEntryType("free")}
              className={`flex-1 h-[38px] text-[12px] font-sans uppercase tracking-[0.5px] ${
                entryType === "free" ? "bg-bk-gold-light text-bk-bg" : "bg-bk-surface text-bk-body border border-bk-border"
              }`}
            >
              Free
            </button>
            <button
              type="button"
              onClick={() => setEntryType("paid")}
              className={`flex-1 h-[38px] text-[12px] font-sans uppercase tracking-[0.5px] ${
                entryType === "paid" ? "bg-bk-gold-light text-bk-bg" : "bg-bk-surface text-bk-body border border-bk-border"
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

              <label className={labelClass}>Payment instructions</label>
              <textarea
                value={paymentInstructions}
                onChange={(e) => setPaymentInstructions(e.target.value)}
                placeholder="e.g. JazzCash 0300-1234567 (Ali Khan), or bank transfer details"
                rows={2}
                className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 resize-none"
              />
              <p className="font-sans text-[11px] text-bk-muted mt-1">
                Shown to players before they upload proof of payment — tell them where to actually
                send the money.
              </p>
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

          <div className="mt-4">
            <TierPicker value={competitiveTier} onChange={setCompetitiveTier} />
          </div>

          <CountryPicker value={country} onChange={setCountry} defaultLabel="My organization's country" />

          <VenuePicker value={venue} onChange={setVenue} />

          <AudiencePicker
            scope={audienceScope}
            freshProof={freshProof}
            onChange={(s, f) => {
              setAudienceScope(s);
              setFreshProof(f);
            }}
          />

          <label className={labelClass}>Rules</label>
          <RulesEditor gameId={gameId} rules={rules} onChange={setRules} />

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
