"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import ResultPanel, { CrossIcon, TickIcon, type PanelCheck } from "@/components/auth/ResultPanel";
import SocialLogin, { OrDivider } from "@/components/auth/SocialLogin";
import AuthStageRail from "@/components/auth/AuthStageRail";
import ResendConfirmation from "@/components/auth/ResendConfirmation";
import { Checkbox, PasswordField, SelectField, TextField, Label, fieldClass } from "@/components/auth/fields";
import DobField from "@/components/auth/DobField";
import { COUNTRY_LIST } from "@/components/auth/country-list";
import { DIAL_CODES } from "@/lib/dial-codes";
import { PLATFORM_MIN_AGE } from "@/lib/age";
import { ADULT_AGE, birthInfo, passwordChecks, resetChecks } from "@/lib/validation/auth";
import { safeRedirect } from "@/lib/safe-redirect";

const STAGES = ["Create account", "Confirm email", "Play"] as const;
export default function SignupForm({ twitchEnabled }: { twitchEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = safeRedirect(params.get("redirectTo"));

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [country, setCountry] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [dialCountry, setDialCountry] = useState("");
  const [dialTouched, setDialTouched] = useState(false);
  const [phone, setPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [marketingEmail, setMarketingEmail] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [checks, setChecks] = useState<PanelCheck[] | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const age = birthInfo(birthDate)?.age ?? null;
  const isMinor = age !== null && age >= PLATFORM_MIN_AGE && age < ADULT_AGE;

  // Live password hints (the one thing that is checked in the browser as you type; the
  // server re-checks everything on submit and is the real authority).
  const live = password ? passwordChecks(password, { email: email.trim().toLowerCase(), username: username.trim().toLowerCase() }) : null;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  function pickCountry(code: string) {
    setCountry(code);
    if (!dialTouched) setDialCountry(code);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setChecks(null);

    // Browser-side: only the password rules and the match, so a typo costs no round trip.
    const local = resetChecks(password, confirmPassword, {
      email: email.trim().toLowerCase(),
      username: username.trim().toLowerCase(),
    }).filter((c) => !c.ok);
    if (local.length > 0) {
      setChecks(local);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, firstName, lastName, username, password, confirmPassword, country, birthDate,
          dialCountry: phone ? dialCountry : "", phone, guardianEmail: isMinor ? guardianEmail : "",
          acceptTerms, acceptPrivacy, marketingEmail, redirectTo,
        }),
      });
      const data = await res.json();
      setChecks(data.checks);
      if (data.ok && data.status === "confirm_email") {
        setSentTo(data.email);
        window.scrollTo({ top: 0 });
      } else if (data.ok) {
        router.push(data.next ?? "/");
        router.refresh();
        return;
      }
    } catch {
      setChecks([{ id: "network", ok: false, message: "Couldn't reach the server. Check your connection and try again." }]);
    }
    setSubmitting(false);
  }

  if (sentTo) {
    return (
      <div className="w-full max-w-[460px]">
        <AuthStageRail step={2} labels={STAGES} />
        <div className="rounded-2xl border border-bk-border bg-bk-bg p-7 text-center" style={{ boxShadow: "0 0 60px rgba(244,200,66,0.07)" }}>
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-bk-teal/15 text-bk-teal flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3.5 7.5l8.5 6 8.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="font-sans font-extrabold text-[26px] leading-tight text-bk-heading mb-2">Check your email</h1>
          <p className="font-sans text-[14px] text-bk-body mb-1">We sent a confirmation link to</p>
          <p className="font-sans text-[14px] font-bold text-bk-heading mb-4 break-all">{sentTo}</p>
          <p className="font-sans text-[14px] text-bk-body mb-6">Open the email on any device and press the button to log in. If it isn&apos;t there, check your spam folder.</p>
          {isMinor && (
            <p className="font-sans text-[12px] text-bk-muted mb-6">
              We&apos;ll also ask your parent or guardian for permission, so you can enter tournaments.
            </p>
          )}
          <Link href="/?confirm_email=1" className={buttonClass("primary", "lg", "w-full rounded-xl")}>
            Back to home
          </Link>
          <div className="mt-4"><ResendConfirmation email={sentTo} redirectTo={redirectTo} /></div>
          <button
            type="button"
            onClick={() => { setSentTo(null); setChecks(null); setSubmitting(false); }}
            className="mt-3 font-sans text-[12px] text-bk-muted underline underline-offset-2 hover:text-bk-body"
          >
            Wrong email? Start again
          </button>
        </div>
      </div>
    );
  }

  const loginHref = params.get("redirectTo") ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : "/login";
  const rule = (ok: boolean, text: string) => (
    <li key={text} className={`flex items-center gap-1.5 text-[12px] ${ok ? "text-bk-teal" : "text-bk-muted"}`}>
      {ok ? <TickIcon /> : <span className="w-4 h-4 shrink-0 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" /></span>}
      {text}
    </li>
  );

  return (
    <div className="w-full max-w-[460px]">
      <AuthStageRail step={1} labels={STAGES} />
      <h1 className="font-sans font-extrabold text-[32px] leading-[1.15] text-bk-heading mb-2 text-center">Create your account</h1>
      <p className="font-sans text-[14px] text-bk-body mb-6 text-center">Sign up to join tournaments and start playing.</p>

      <div className="rounded-2xl border border-bk-border bg-bk-bg p-6 sm:p-7" style={{ boxShadow: "0 0 60px rgba(244,200,66,0.07)" }}>
        <ResultPanel checks={checks} successMessage="Account created" />

        <SocialLogin redirectTo={redirectTo} twitchEnabled={twitchEnabled} onError={(m) => setChecks([{ id: "oauth", ok: false, message: m }])} />
        <OrDivider>or with your email address</OrDivider>

        <form onSubmit={submit} noValidate className="space-y-3.5">
          <TextField label="Email" type="email" inputMode="email" autoComplete="email" placeholder="Your email address" value={email} onChange={(e) => setEmail(e.target.value)} />

          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3.5">
            <TextField label="First name" autoComplete="given-name" placeholder="Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={50} />
            <TextField label="Last name" autoComplete="family-name" placeholder="Surname" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={50} />
          </div>

          <TextField label="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="3 to 20 letters, numbers or _" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} maxLength={20} />

          <div>
            <PasswordField label="Password" autoComplete="new-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value.replace(/\s/g, ""))} maxLength={72} />
            {live && (
              <ul className="mt-2 grid grid-cols-1 min-[420px]:grid-cols-2 gap-x-3 gap-y-1" aria-label="Password rules">
                {live.filter((c) => c.id !== "pw_common").map((c) => rule(c.ok, c.message.replace("Password ", "")))}
              </ul>
            )}
          </div>

          <div>
            <PasswordField label="Confirm password" autoComplete="new-password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value.replace(/\s/g, ""))} maxLength={72} />
            {mismatch && (
              <p className="mt-1.5 flex items-center gap-1.5 font-sans text-[12px] text-bk-live"><CrossIcon /> Passwords don&apos;t match</p>
            )}
          </div>

          <SelectField label="Country" value={country} onChange={(e) => pickCountry(e.target.value)} autoComplete="country">
            <option value="">Select your country</option>
            {COUNTRY_LIST.map((c) => (<option key={c.code} value={c.code}>{c.name}</option>))}
          </SelectField>

          <DobField onChange={setBirthDate} />

          {isMinor && (
            <div className="rounded-xl border border-bk-amber/50 bg-bk-surface p-3.5">
              <p className="font-sans text-[12px] text-bk-body mb-3">
                You&apos;re under {ADULT_AGE}, so a parent or guardian has to give permission. We&apos;ll email them after you confirm your own email.
              </p>
              <TextField label="Parent or guardian email" type="email" inputMode="email" placeholder="Their email address" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} />
            </div>
          )}

          <div>
            <Label optional>Mobile number</Label>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2">
              <select
                aria-label="Country code"
                className={`${fieldClass} px-3`}
                value={dialCountry}
                onChange={(e) => { setDialCountry(e.target.value); setDialTouched(true); }}
              >
                <option value="">Code</option>
                {COUNTRY_LIST.map((c) => (<option key={c.code} value={c.code}>{c.code} +{DIAL_CODES[c.code]}</option>))}
              </select>
              <input aria-label="Mobile number" className={fieldClass} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="Mobile number" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s()-]/g, ""))} maxLength={16} />
            </div>
          </div>

          <div className="space-y-3 pt-1.5">
            <Checkbox checked={acceptTerms} onChange={setAcceptTerms}>
              I have read and accept the <Link href="/terms" target="_blank" className="text-bk-gold-light underline underline-offset-2">Terms of Use</Link> of the platform.
            </Checkbox>
            <Checkbox checked={acceptPrivacy} onChange={setAcceptPrivacy}>
              I have read and accept the <Link href="/privacy" target="_blank" className="text-bk-gold-light underline underline-offset-2">Privacy Policy</Link> of the platform.
            </Checkbox>
            <Checkbox checked={marketingEmail} onChange={setMarketingEmail}>
              I&apos;m happy to receive BattleKrypt news, offers and updates by email. <span className="text-bk-muted">(optional)</span>
            </Checkbox>
          </div>

          <button type="submit" disabled={submitting} className={buttonClass("primary", "lg", "w-full rounded-xl")}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="font-sans text-[13px] text-bk-body text-center mt-5">
          Already registered?{" "}
          <Link href={loginHref} className="text-bk-gold-light font-bold uppercase tracking-[0.8px] text-[12px]">Login!</Link>
        </p>
        <p className="font-sans text-[11px] text-bk-muted text-center mt-3">
          Your privacy and security are important to us. We only use your details to run your account and competitions.
        </p>
      </div>
    </div>
  );
}
