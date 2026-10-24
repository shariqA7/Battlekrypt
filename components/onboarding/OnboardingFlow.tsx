"use client";

import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import ResultPanel, { type PanelCheck } from "@/components/auth/ResultPanel";
import DobField from "@/components/auth/DobField";
import { COUNTRY_LIST } from "@/components/auth/country-list";
import { SelectField, TextField, Label } from "@/components/auth/fields";
import GamePicker, { type PickerGame } from "@/components/onboarding/GamePicker";
import { MAX_FAVORITE_GAMES } from "@/lib/onboarding-rules";
import { birthInfo } from "@/lib/validation/auth";

export interface OnboardingProps {
  missing: { name: boolean; username: boolean; birthDate: boolean; country: boolean; guardianEmail: boolean };
  needsAbout: boolean;
  initialFirstName: string;
  initialLastName: string;
  isMinor: boolean;
  guardianEmailOnFile: boolean;
  games: PickerGame[];
  initialGames: string[];
  initialPlayStyle: string;
  initialGender: string;
  initialHobbies: string;
  redirectTo: string;
}

type StepId = "about" | "games" | "style" | "done";
const LABELS: Record<StepId, string> = { about: "About you", games: "Your games", style: "Play style", done: "Done" };

async function save(body: object): Promise<{ ok: boolean; checks: PanelCheck[] }> {
  try {
    const res = await fetch("/api/players/me/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { ok: !!data.ok, checks: data.checks ?? [] };
  } catch {
    return { ok: false, checks: [{ id: "network", ok: false, message: "Couldn't reach the server. Check your connection and try again." }] };
  }
}

export default function OnboardingFlow(p: OnboardingProps) {
  const router = useRouter();
  const steps: StepId[] = [...(p.needsAbout ? (["about"] as const) : []), "games", "style", "done"];
  const [index, setIndex] = useState(0);
  const step = steps[index];

  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<PanelCheck[] | null>(null);

  // about
  const [firstName, setFirstName] = useState(p.initialFirstName);
  const [lastName, setLastName] = useState(p.initialLastName);
  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [country, setCountry] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  // games / style
  const [games, setGames] = useState(p.initialGames);
  const [playStyle, setPlayStyle] = useState(p.initialPlayStyle);
  const [gender, setGender] = useState(p.initialGender);
  const [hobbies, setHobbies] = useState(p.initialHobbies);

  const typedAge = p.missing.birthDate ? birthInfo(birthDate)?.age ?? null : null;
  const minor = p.missing.birthDate ? typedAge !== null && typedAge >= 13 && typedAge < 18 : p.isMinor;
  const askGuardian = p.missing.birthDate ? minor : p.missing.guardianEmail;

  const onDob = useCallback((iso: string) => setBirthDate(iso), []);
  const next = () => { setChecks(null); setIndex((i) => Math.min(i + 1, steps.length - 1)); window.scrollTo({ top: 0 }); };

  async function finish() {
    setBusy(true);
    const r = await save({ step: "finish" });
    setBusy(false);
    if (!r.ok) { setChecks(r.checks); return false; }
    return true;
  }

  async function submitAbout(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setChecks(null);
    const r = await save({ step: "about", firstName, lastName, username, birthDate, country, guardianEmail });
    setBusy(false);
    setChecks(r.ok ? null : r.checks);
    if (r.ok) next();
  }

  async function submitGames() {
    setBusy(true);
    setChecks(null);
    const r = await save({ step: "games", games });
    setBusy(false);
    if (!r.ok) { setChecks(r.checks); return; }
    next();
  }

  async function submitStyle() {
    setBusy(true);
    setChecks(null);
    const r = await save({ step: "style", playStyle, gender, hobbies });
    setBusy(false);
    if (!r.ok) { setChecks(r.checks); return; }
    if (await finish()) next();
  }

  async function skipStyle() {
    setChecks(null);
    if (await finish()) next();
  }

  const progress = (
    <div className="mb-6" role="group" aria-label="Progress">
      <div className="flex gap-1.5 mb-2">
        {steps.map((s, i) => (
          <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-bk-gold-from" : "bg-bk-border"}`} />
        ))}
      </div>
      <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted">
        Step {index + 1} of {steps.length}: <span className="text-bk-heading">{LABELS[step]}</span>
      </p>
    </div>
  );

  const skip = "font-sans text-[12px] text-bk-muted underline underline-offset-2 hover:text-bk-body";

  return (
    <div>
      {progress}
      <ResultPanel checks={checks} />

      {step === "about" && (
        <form onSubmit={submitAbout} noValidate className="space-y-3.5">
          <h1 className="font-sans font-extrabold text-[26px] leading-tight text-bk-heading">Tell us about you</h1>
          <p className="font-sans text-[14px] text-bk-body !mt-1">Just what we still need to get you into tournaments.</p>
          {p.missing.name && (
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3.5">
              <TextField label="First name" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={50} />
              <TextField label="Last name" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={50} />
            </div>
          )}
          {p.missing.username && (
            <div>
              <TextField label="Username" autoCapitalize="none" spellCheck={false} placeholder="3 to 20 letters, numbers or _" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} maxLength={20} />
              <p className="font-sans text-[12px] text-bk-muted mt-1.5">Shown on rankings instead of your real name. You can&apos;t change it later.</p>
            </div>
          )}
          {p.missing.birthDate && <DobField onChange={onDob} />}
          {p.missing.country && (
            <SelectField label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Select your country</option>
              {COUNTRY_LIST.map((c) => (<option key={c.code} value={c.code}>{c.name}</option>))}
            </SelectField>
          )}
          {askGuardian && (
            <div className="rounded-xl border border-bk-amber/50 bg-bk-surface p-3.5">
              <p className="font-sans text-[12px] text-bk-body mb-3">
                You&apos;re under 18, so a parent or guardian has to give permission before you can join anything. We&apos;ll email them straight away. Until then you can browse.
              </p>
              <TextField label="Parent or guardian email" type="email" inputMode="email" placeholder="Their email address" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} />
            </div>
          )}
          <button type="submit" disabled={busy} className={buttonClass("primary", "lg", "w-full rounded-xl")}>{busy ? "Saving..." : "Continue"}</button>
        </form>
      )}

      {step === "games" && (
        <div className="space-y-4">
          <h1 className="font-sans font-extrabold text-[26px] leading-tight text-bk-heading">What do you play?</h1>
          <p className="font-sans text-[14px] text-bk-body !mt-1">Pick your favourites. We&apos;ll show you matching tournaments first.</p>
          <GamePicker games={p.games} selected={games} onChange={setGames} max={MAX_FAVORITE_GAMES} />
          <button type="button" onClick={submitGames} disabled={busy} className={buttonClass("primary", "lg", "w-full rounded-xl")}>
            {busy ? "Saving..." : games.length ? "Continue" : "Continue without picking"}
          </button>
          <div className="text-center"><button type="button" onClick={next} className={skip}>Skip for now</button></div>
        </div>
      )}

      {step === "style" && (
        <div className="space-y-4">
          <h1 className="font-sans font-extrabold text-[26px] leading-tight text-bk-heading">How do you like to play?</h1>
          <div>
            <Label optional>Play style</Label>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Play style">
              {[
                { v: "casual", t: "Casual", d: "For fun, with friends" },
                { v: "competitive", t: "Competitive", d: "Ranked, prizes, trophies" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  role="radio"
                  aria-checked={playStyle === o.v}
                  onClick={() => setPlayStyle(playStyle === o.v ? "" : o.v)}
                  className={`p-3.5 rounded-xl border text-left transition-colors ${playStyle === o.v ? "border-bk-gold-from bg-bk-gold-from/10" : "border-bk-border bg-bk-surface hover:border-bk-gold-from"}`}
                >
                  <span className="block font-sans font-bold text-[14px] text-bk-heading">{o.t}</span>
                  <span className="block font-sans text-[12px] text-bk-muted mt-0.5">{o.d}</span>
                </button>
              ))}
            </div>
          </div>
          <SelectField label="Gender" optional value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </SelectField>
          <label className="block">
            <Label optional>Hobbies and interests</Label>
            <textarea
              value={hobbies}
              onChange={(e) => setHobbies(e.target.value)}
              rows={2}
              maxLength={200}
              className="w-full bg-bk-surface border border-bk-border text-bk-heading placeholder:text-bk-muted text-[14px] font-sans px-4 py-3 rounded-xl outline-none focus:border-bk-gold-light"
            />
          </label>
          <button type="button" onClick={submitStyle} disabled={busy} className={buttonClass("primary", "lg", "w-full rounded-xl")}>{busy ? "Saving..." : "Finish"}</button>
          <div className="text-center"><button type="button" onClick={skipStyle} disabled={busy} className={skip}>Skip for now</button></div>
        </div>
      )}

      {step === "done" && (
        <div className="text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-bk-teal/15 text-bk-teal flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="font-sans font-extrabold text-[26px] leading-tight text-bk-heading mb-2">You&apos;re all set</h1>
          <p className="font-sans text-[14px] text-bk-body mb-5">You can change most of this any time from Profile settings.</p>
          {minor && (
            <div className="rounded-xl border border-bk-amber/50 bg-bk-surface p-3.5 text-left mb-5">
              <p className="font-sans text-[13px] text-bk-heading font-bold mb-1">Waiting for a parent or guardian</p>
              <p className="font-sans text-[12px] text-bk-body">
                {p.guardianEmailOnFile || guardianEmail
                  ? "We emailed them. Once they approve you can join tournaments, scrims, leagues and challenges. Until then you can browse everything."
                  : "Ask a parent or guardian to approve you from your dashboard. Until then you can browse everything."}
              </p>
            </div>
          )}
          <button type="button" onClick={() => { router.push(p.redirectTo); router.refresh(); }} className={buttonClass("primary", "lg", "w-full rounded-xl")}>
            Start exploring
          </button>
          <div className="flex justify-center gap-4 mt-4">
            <Link href="/tournaments" className={skip}>Tournaments</Link>
            <Link href="/challenges" className={skip}>Challenges</Link>
            <Link href="/rankings" className={skip}>Rankings</Link>
          </div>
        </div>
      )}
    </div>
  );
}
