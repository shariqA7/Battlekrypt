"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordForm() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    // Always show the same message whether or not the email is registered
    // — confirming/denying an account's existence here is a real
    // user-enumeration risk, and Supabase's own response doesn't
    // distinguish the two cases anyway.
    setSubmitting(false);
    setSent(true);
  }

  if (sent) {
    return (
      <p className="font-sans text-[13px] text-bk-gold-light text-center">
        If an account exists for that email, we&apos;ve sent a password reset link.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
        Email
      </label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
        className="w-full bg-bk-surface border border-bk-border rounded-xl text-bk-heading placeholder:text-bk-muted text-[13px] font-sans px-4 h-[46px] mb-4 outline-none transition-all focus:border-bk-gold-light focus:shadow-[0_0_0_3px_rgba(244,200,66,0.12)]"
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-white text-bk-bg rounded-xl font-sans font-bold text-[13px] py-3.5 transition-all hover:opacity-90 hover:-translate-y-px active:translate-y-0 disabled:opacity-50"
      >
        {submitting ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
