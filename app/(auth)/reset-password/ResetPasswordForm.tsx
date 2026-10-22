"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import ResultPanel, { TickIcon, type PanelCheck } from "@/components/auth/ResultPanel";
import { PasswordField } from "@/components/auth/fields";
import { passwordChecks, resetChecks } from "@/lib/validation/auth";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checks, setChecks] = useState<PanelCheck[] | null>(null);
  const [expired, setExpired] = useState(false);

  const live = password ? passwordChecks(password) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setChecks(null);

    // Browser-side: the password rules and the match, for instant feedback.
    const local = resetChecks(password, confirmPassword).filter((c) => !c.ok);
    if (local.length > 0) {
      setChecks(local);
      return;
    }

    setSubmitting(true);
    try {
      // The recovery link signed this browser in temporarily; the server uses that
      // session, re-checks every rule, and only then changes the password.
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const data = await res.json();
      setChecks(data.checks);
      if (res.status === 401) setExpired(true);
      if (data.ok) {
        router.push("/");
        router.refresh();
        return;
      }
    } catch {
      setChecks([{ id: "network", ok: false, message: "Couldn't reach the server. Please try again." }]);
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
      <ResultPanel checks={checks} successMessage="Password updated" />
      <PasswordField label="New password" autoComplete="new-password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value.replace(/\s/g, ""))} maxLength={72} />
      {live && (
        <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-x-3 gap-y-1" aria-label="Password rules">
          {live.filter((c) => c.id !== "pw_common").map((c) => (
            <li key={c.id} className={`flex items-center gap-1.5 text-[12px] ${c.ok ? "text-bk-teal" : "text-bk-muted"}`}>
              {c.ok ? <TickIcon /> : <span className="w-4 h-4 shrink-0 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" /></span>}
              {c.message.replace("Password ", "")}
            </li>
          ))}
        </ul>
      )}
      <PasswordField label="Confirm password" autoComplete="new-password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value.replace(/\s/g, ""))} maxLength={72} />
      <button type="submit" disabled={submitting} className={buttonClass("primary", "lg", "w-full rounded-xl")}>
        {submitting ? "Updating..." : "Update password"}
      </button>
      {expired && (
        <Link href="/forgot-password" className="block text-center font-sans text-[13px] text-bk-gold-light underline underline-offset-2">
          Request a new reset link
        </Link>
      )}
    </form>
  );
}
