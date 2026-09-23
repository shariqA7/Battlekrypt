"use client";

// The inline (non-modal) version of the auth UI, used directly by the
// dedicated /login and /signup pages. AuthModal.tsx (the popup version
// with a dark backdrop and click-outside-to-close) stays available for a
// future case where login needs to interrupt an existing page without
// navigating away — but the dedicated auth pages shouldn't use it, since
// there's no real page behind the backdrop there, and the click-away
// behavior was silently navigating people to "/" when they didn't intend
// to leave, breaking the back button in the process.
//
// Visual structure follows the reference the team pointed to (Claude.ai's
// sign-in page): big headline + subtext above a rounded, bordered card
// containing OAuth pills, a plain "OR" divider, a rounded email field, and
// a solid CTA, with fine print below. Deliberately NOT importing a serif
// display font to match the reference's typography — the spec's design
// system (§14) calls for exactly two typefaces app-wide (sans for UI,
// mono for match data), and a one-off serif here would break that for the
// sake of surface resemblance. The headline instead uses the app's
// existing sans font, just large and bold, to carry the same weight.

import { useState } from "react";

interface AuthFormProps {
  title?: string;
  subtitle?: string;
  onGoogleLogin: () => void;
  onDiscordLogin: () => void;
  onEmailContinue: (value: string) => void;
}

export default function AuthForm({
  title = "Sign in",
  subtitle = "Create an account to register and play",
  onGoogleLogin,
  onDiscordLogin,
  onEmailContinue,
}: AuthFormProps) {
  const [emailOrPhone, setEmailOrPhone] = useState("");

  return (
    <div className="w-[380px]">
      <p className="font-sans font-extrabold text-[32px] leading-[1.15] text-bk-heading mb-2">
        {title}
      </p>
      <p className="font-sans text-[14px] text-bk-body mb-7">{subtitle}</p>

      <div
        className="rounded-2xl border border-bk-border p-7"
        style={{ boxShadow: "0 0 60px rgba(244,200,66,0.07)" }}
      >
        <button
          type="button"
          onClick={onGoogleLogin}
          className="w-full bg-bk-surface border border-bk-border rounded-xl text-bk-heading font-sans font-medium text-[13px] py-3 flex items-center justify-center gap-2.5 mb-2.5 transition-all hover:bg-white/[0.04] hover:-translate-y-px active:translate-y-0"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <button
          type="button"
          onClick={onDiscordLogin}
          className="w-full bg-bk-surface border border-bk-border rounded-xl text-bk-heading font-sans font-medium text-[13px] py-3 flex items-center justify-center gap-2.5 mb-5 transition-all hover:bg-white/[0.04] hover:-translate-y-px active:translate-y-0"
        >
          <DiscordIcon />
          Continue with Discord
        </button>

        <p className="text-center text-bk-muted text-[11px] tracking-[1.5px] font-sans mb-5">
          OR
        </p>

        <input
          type="email"
          value={emailOrPhone}
          onChange={(e) => setEmailOrPhone(e.target.value)}
          placeholder="Enter your email"
          className="w-full bg-bk-surface border border-bk-border rounded-xl text-bk-heading placeholder:text-bk-muted text-[13px] font-sans px-4 h-[46px] mb-3 outline-none transition-all focus:border-bk-gold-light focus:shadow-[0_0_0_3px_rgba(244,200,66,0.12)]"
        />

        <button
          type="button"
          onClick={() => {
            if (!emailOrPhone.trim()) return;
            onEmailContinue(emailOrPhone.trim());
          }}
          className="w-full bg-white text-bk-bg rounded-xl font-sans font-bold text-[13px] py-3.5 transition-all hover:opacity-90 hover:-translate-y-px active:translate-y-0"
        >
          Continue with email
        </button>

        <p className="text-center text-bk-muted text-[11px] font-sans mt-5">
          By continuing, you agree to BattleKrypt&apos;s Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.26a18.3 18.3 0 0 0-5.48 0c-.17-.4-.4-.88-.62-1.26a.08.08 0 0 0-.08-.04c-1.71.29-3.35.8-4.89 1.52a.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.11 13 13 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.08.08 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.06 0a.08.08 0 0 1 .08.01c.12.1.24.2.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.37 1.23 2a.08.08 0 0 0 .08.03 19.9 19.9 0 0 0 6.01-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.66-3.55-13.66a.06.06 0 0 0-.03-.03z" />
    </svg>
  );
}