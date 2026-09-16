"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AuthModal from "@/components/ui/AuthModal";
import Nav from "@/components/layout/Nav";

export default function LoginPage() {
  return (
    <>
      <Nav />
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}

function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";
  const [error, setError] = useState<string | null>(null);

  async function signInWithOAuth(provider: "google" | "discord") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(
          redirectTo
        )}`,
      },
    });
    if (error) setError(error.message);
    // On success, Supabase redirects the browser to the provider — no
    // further client-side action needed here.
  }

  async function signInWithEmail(value: string) {
    // Phase 1: magic-link email auth. Phone/password can be added once
    // an SMS provider is chosen — same pattern via supabase.auth.signInWithOtp.
    const { error } = await supabase.auth.signInWithOtp({
      email: value,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(
          redirectTo
        )}`,
      },
    });
    if (error) setError(error.message);
    else setError("Check your email for a login link.");
  }

  return (
    <div>
      <AuthModal
        open={true}
        onClose={() => router.push("/")}
        onGoogleLogin={() => signInWithOAuth("google")}
        onDiscordLogin={() => signInWithOAuth("discord")}
        onEmailContinue={signInWithEmail}
      />
      {error && (
        <p className="text-bk-live text-[12px] font-sans text-center mt-3 max-w-[320px]">
          {error}
        </p>
      )}
    </div>
  );
}
