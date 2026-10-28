"use client";

import { useState, type FormEvent } from "react";
import { buttonClass } from "@/components/ui/Button";
import ResultPanel, { type PanelCheck } from "@/components/auth/ResultPanel";
import { TextField } from "@/components/auth/fields";
import Turnstile, { captchaRequired } from "@/components/auth/Turnstile";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [checks, setChecks] = useState<PanelCheck[] | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setChecks(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, captchaToken }),
      });
      const data = await res.json();
      setCaptchaReset((n) => n + 1); // a human-check token works once
      setChecks(data.checks);
      // The server gives the same answer whether or not the email has an account,
      // so people can't use this form to find out who is registered.
      if (data.ok) setSent(true);
    } catch {
      setChecks([{ id: "network", ok: false, message: "Couldn't reach the server. Please try again." }]);
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <ResultPanel checks={checks} successMessage="If an account exists for that email, a reset link is on its way" />
      {!sent && (
        <>
          <TextField label="Email" type="email" inputMode="email" autoComplete="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
          <button type="submit" disabled={submitting || (captchaRequired && !captchaToken)} className={buttonClass("primary", "lg", "w-full rounded-xl")}>
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </>
      )}
    </form>
  );
}
