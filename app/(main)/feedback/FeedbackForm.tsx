"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import Turnstile, { captchaRequired } from "@/components/auth/Turnstile";
import { FEEDBACK_KINDS, FEEDBACK_KIND_LABEL, FEEDBACK_MESSAGE_MAX, FEEDBACK_MESSAGE_MIN } from "@/lib/feedback-rules";

const inputClass = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
const labelClass = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

export default function FeedbackForm({ signedIn, initialKind, from }: { signedIn: boolean; initialKind: string; from: string }) {
  const [kind, setKind] = useState<string>(initialKind);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `from` is the page they were on when they clicked "Send feedback" (path only; the server drops any query).
      body: JSON.stringify({ kind, message, email: signedIn ? "" : email, pageUrl: from, captchaToken }),
    });
    setBusy(false);
    setCaptchaReset((n) => n + 1); // a human-check token works once
    setCaptchaToken("");
    if (res.ok) return setSent(true);
    setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong. Please try again.");
  }

  if (sent) {
    return (
      <Panel className="p-5">
        <p className="font-sans font-bold text-bk-heading text-[15px] mb-1">Thank you!</p>
        <p className="font-sans text-bk-body text-[13px] mb-4">Your message reached the team.{signedIn ? " We'll notify you here if we decide something about it." : ""}</p>
        <Link href="/" className="font-sans text-[12px] text-bk-gold-light underline">Back to home</Link>
      </Panel>
    );
  }

  return (
    <form onSubmit={submit}>
      <label className={labelClass} htmlFor="fb-kind">What is this about?</label>
      <select id="fb-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
        {FEEDBACK_KINDS.map((k) => (
          <option key={k} value={k}>{FEEDBACK_KIND_LABEL[k]}</option>
        ))}
      </select>

      <label className={labelClass} htmlFor="fb-message">{kind === "issue" ? "What went wrong?" : "Tell us more"}</label>
      <textarea
        id="fb-message"
        required
        minLength={FEEDBACK_MESSAGE_MIN}
        maxLength={FEEDBACK_MESSAGE_MAX}
        rows={7}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={kind === "issue" ? "What did you do, what did you expect, and what happened instead? Which page?" : "What would you like BattleKrypt to do, and why would it help?"}
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2"
      />
      <p className="font-sans text-[11px] text-bk-muted mt-1">{message.trim().length}/{FEEDBACK_MESSAGE_MAX}</p>

      {!signedIn && (
        <>
          <label className={labelClass} htmlFor="fb-email">Your email (optional, only if you want a reply)</label>
          <input id="fb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className={inputClass} autoComplete="email" />
        </>
      )}
      <p className="font-sans text-[11px] text-bk-muted mt-4">
        Please don&apos;t include passwords or payment details. {signedIn ? "We can see which account sent this." : "You don't need an account."}
      </p>

      <div className="mt-4"><Turnstile onToken={setCaptchaToken} resetKey={captchaReset} /></div>
      {error && <p className="text-bk-live text-[12px] font-sans mt-3" role="alert">{error}</p>}
      <button
        type="submit"
        disabled={busy || (captchaRequired && !captchaToken)}
        className="w-full mt-6 bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 disabled:opacity-50"
      >
        {busy ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
