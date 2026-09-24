"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const fieldClass =
  "w-full bg-bk-surface border border-bk-border rounded-xl text-bk-heading placeholder:text-bk-muted text-[13px] font-sans px-4 h-[46px] outline-none transition-all focus:border-bk-gold-light focus:shadow-[0_0_0_3px_rgba(244,200,66,0.12)]";

export default function ResetPasswordForm() {
  const supabase = createClient();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    // The Supabase client auto-detects the recovery token in this page's
    // URL on load and establishes a temporary session from it, which is
    // what makes this update work without knowing the old password.
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(
        updateError.message ||
          "Couldn't update your password. The reset link may have expired — request a new one."
      );
      setSubmitting(false);
      return;
    }
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
        New password
      </label>
      <input
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 8 characters"
        autoComplete="new-password"
        className={`${fieldClass} mb-3`}
      />

      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
        Confirm password
      </label>
      <input
        type="password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="Re-enter password"
        autoComplete="new-password"
        className={`${fieldClass} mb-4`}
      />

      {error && <p className="font-sans text-[12px] text-bk-live mb-3">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-white text-bk-bg rounded-xl font-sans font-bold text-[13px] py-3.5 transition-all hover:opacity-90 hover:-translate-y-px active:translate-y-0 disabled:opacity-50"
      >
        {submitting ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}
