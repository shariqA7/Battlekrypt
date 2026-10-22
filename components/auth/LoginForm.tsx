"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import ResultPanel, { type PanelCheck } from "@/components/auth/ResultPanel";
import SocialLogin, { OrDivider } from "@/components/auth/SocialLogin";
import { PasswordField, TextField } from "@/components/auth/fields";
import { loginChecks, allOk } from "@/lib/validation/auth";
import { safeRedirect } from "@/lib/safe-redirect";

const URL_ERRORS: Record<string, string> = {
  auth_failed: "Sign-in didn't complete. Please try again.",
  twitch_off: "Twitch sign-in isn't available right now.",
};

export default function LoginForm({ twitchEnabled }: { twitchEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = safeRedirect(params.get("redirectTo"));
  const urlError = params.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checks, setChecks] = useState<PanelCheck[] | null>(
    urlError ? [{ id: "url", ok: false, message: URL_ERRORS[urlError] ?? "Sign-in didn't complete. Please try again." }] : null
  );
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setChecks(null);

    // Same rules the server uses, so an empty form never costs a round trip.
    const local = loginChecks(email, password);
    if (!allOk(local)) {
      setChecks(local);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, redirectTo }),
      });
      const data = await res.json();
      setChecks(data.checks);
      if (data.ok) {
        setDone(true);
        router.push(data.next ?? "/");
        router.refresh();
        return;
      }
    } catch {
      setChecks([{ id: "network", ok: false, message: "Couldn't reach the server. Check your connection and try again." }]);
    }
    setSubmitting(false);
  }

  const signupHref = params.get("redirectTo") ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}` : "/signup";

  return (
    <div className="w-full max-w-[420px]">
      <h1 className="font-sans font-extrabold text-[32px] leading-[1.15] text-bk-heading mb-2 text-center">Login</h1>
      <p className="font-sans text-[14px] text-bk-body mb-6 text-center">
        You can login quickly using one of our single sign-on options.
      </p>

      <div className="rounded-2xl border border-bk-border bg-bk-bg p-6 sm:p-7" style={{ boxShadow: "0 0 60px rgba(244,200,66,0.07)" }}>
        <ResultPanel checks={checks} successMessage="Signed in" />

        <SocialLogin
          redirectTo={redirectTo}
          twitchEnabled={twitchEnabled}
          onError={(m) => setChecks([{ id: "oauth", ok: false, message: m }])}
        />
        <OrDivider>or continue with</OrDivider>

        <form onSubmit={submit} noValidate className="space-y-3.5">
          <TextField
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordField
            label="Password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={submitting || done} className={buttonClass("primary", "lg", "w-full rounded-xl")}>
            {submitting || done ? "Signing in..." : "Login"}
          </button>
        </form>

        <Link href={signupHref} className={buttonClass("outline", "lg", "w-full rounded-xl mt-3")}>
          Create a free account
        </Link>

        <p className="font-sans text-[13px] text-bk-body text-center mt-5">
          Can&apos;t remember your password?{" "}
          <Link href="/forgot-password" className="text-bk-gold-light underline underline-offset-2">
            Recover now!
          </Link>
        </p>
      </div>
    </div>
  );
}
