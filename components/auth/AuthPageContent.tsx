"use client";

// Shared by both /login and /signup — they're functionally identical
// (Supabase creates the account automatically on first OAuth/magic-link
// use, there's no separate registration step), but each renders directly
// rather than one redirecting to the other. A hard redirect here was
// causing a confusing back-button loop: Back from /login would bounce to
// /signup, which immediately redirected forward to /login again.
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AuthForm from "@/components/ui/AuthForm";

export default function AuthPageContent({ mode }: { mode: "login" | "signup" }) {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

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

  async function signInWithEmail(value: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email: value,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(
          redirectTo
        )}`,
      },
    });
    if (error) {
      setIsError(true);
      setMessage(error.message);
    } else {
      setIsError(false);
      setMessage(`Check ${value} for a login link.`);
    }
  }

  return (
    <div>
      <AuthForm
        title={mode === "signup" ? "Create your account" : "Sign in"}
        subtitle={
          mode === "signup"
            ? "Sign up to join tournaments and start playing"
            : "Welcome back — sign in to continue"
        }
        onGoogleLogin={() => signInWithOAuth("google")}
        onDiscordLogin={() => signInWithOAuth("discord")}
        onEmailContinue={signInWithEmail}
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
