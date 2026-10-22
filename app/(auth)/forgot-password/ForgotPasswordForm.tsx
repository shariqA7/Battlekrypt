"use client";

import { useState, type FormEvent } from "react";
import { buttonClass } from "@/components/ui/Button";
import ResultPanel, { type PanelCheck } from "@/components/auth/ResultPanel";
import { TextField } from "@/components/auth/fields";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
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
          <button type="submit" disabled={submitting} className={buttonClass("primary", "lg", "w-full rounded-xl")}>
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </>
      )}
    </form>
  );
}
