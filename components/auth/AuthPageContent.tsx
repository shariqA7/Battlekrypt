"use client";

// Shared by both /login and /signup. OAuth (Google/Discord) still routes
// through /auth/callback, which is where ensureUserRecord normally runs.
// Password sign-in/sign-up establishes a session directly in the browser
// with no such round-trip, so both paths here call /api/auth/ensure-user
// right after, to guarantee the local User/PlayerProfile rows exist and to
// get the same isNewUser signal the callback route uses to route into
// /onboarding.
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AuthForm from "@/components/ui/AuthForm";

export default function AuthPageContent({ mode }: { mode: "login" | "signup" }) {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function signInWithOAuth(provider: "google" | "discord") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(
          redirectTo
        )}`,
      },
    });
    if (error) {
      setIsError(true);
      setMessage(error.message);
    }
  }

  // Runs after any client-side session establishment (password login, or
  // signup when Supabase's "Confirm email" setting happens to be off and
  // signUp returns an active session immediately). Mirrors what the
  // /auth/callback route does for OAuth/magic-link: guarantee the local
  // rows exist, then route new accounts into onboarding.
  async function finishLogin() {
    const res = await fetch("/api/auth/ensure-user", { method: "POST" });
    if (!res.ok) {
      setIsError(true);
      setMessage("Signed in, but couldn't load your account. Try refreshing the page.");
      setSubmitting(false);
      return;
    }
    const { isNewUser } = await res.json();
    router.push(
      isNewUser ? `/onboarding?redirectTo=${encodeURIComponent(redirectTo)}` : redirectTo
    );
  }

  async function handleLogin(email: string, password: string) {
    setSubmitting(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setIsError(true);
      setMessage(error.message);
      setSubmitting(false);
      return;
    }
    await finishLogin();
  }

  async function handleSignup(fields: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    setSubmitting(true);
    setMessage(null);
    const { data, error } = await supabase.auth.signUp({
      email: fields.email,
      password: fields.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(
          redirectTo
        )}`,
        data: { full_name: `${fields.firstName} ${fields.lastName}`.trim() },
      },
    });
    if (error) {
      setIsError(true);
      setMessage(error.message);
      setSubmitting(false);
      return;
    }
    if (data.session) {
      // "Confirm email" is off on this Supabase project — signUp already
      // logged them in, so proceed exactly like a normal login.
      await finishLogin();
      return;
    }
    setIsError(false);
    setMessage(
      `We sent a confirmation link to ${fields.email}. Click it to finish creating your account.`
    );
    setSubmitting(false);
  }

  return (
    <div>
      <AuthForm
        mode={mode}
        title={mode === "signup" ? "Create your account" : "Sign in"}
        subtitle={
          mode === "signup"
            ? "Sign up to join tournaments and start playing"
            : "Welcome back — sign in to continue"
        }
        onGoogleLogin={() => signInWithOAuth("google")}
        onDiscordLogin={() => signInWithOAuth("discord")}
        onLogin={handleLogin}
        onSignup={handleSignup}
        submitting={submitting}
      />
      {message && (
        <p
          className={`text-[12px] font-sans text-center mt-3 max-w-[320px] ${
            isError ? "text-bk-live" : "text-bk-gold-light"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
