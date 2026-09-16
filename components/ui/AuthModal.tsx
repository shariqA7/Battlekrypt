"use client";

// AuthModal.tsx
// Requires: import "@fontsource/hanken-grotesk" and "@fontsource/jetbrains-mono"
// (or the Google Fonts <link>/@import from battlekrypt-tokens.css)
// Requires: tailwind.config.js theme.fontFamily.sans = ['Hanken Grotesk', 'sans-serif']
//                                   theme.fontFamily.mono = ['JetBrains Mono', 'monospace']

import { useState } from "react";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onGoogleLogin: () => void;
  onDiscordLogin: () => void;
  onEmailContinue: (value: string) => void;
}

export default function AuthModal({
  open,
  onClose,
  onGoogleLogin,
  onDiscordLogin,
  onEmailContinue,
}: AuthModalProps) {
  const [emailOrPhone, setEmailOrPhone] = useState("");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-[320px] bg-[#1F2833] border border-[#39342A] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-sans font-bold text-[20px] text-[#EAE1D3] mb-1">
          Sign in to join
        </p>
        <p className="font-sans text-[13px] text-[#D1C5AE] mb-5">
          Create an account to register and play
        </p>

        <button
          onClick={onGoogleLogin}
          className="w-full bg-white text-[#0B0C10] font-sans font-bold text-[12px] tracking-[1.2px] uppercase py-3 flex items-center justify-center gap-2 mb-2.5"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <button
          onClick={onDiscordLogin}
          className="w-full bg-[#5865F2] text-white font-sans font-bold text-[12px] tracking-[1.2px] uppercase py-3 flex items-center justify-center gap-2 mb-3.5"
        >
          <DiscordIcon />
          Continue with Discord
        </button>

        <div className="flex items-center gap-2.5 mb-3.5">
          <div className="flex-1 h-px bg-[#39342A]" />
          <span className="text-[#7A7365] text-[10px] tracking-[1px] font-sans">
            OR
          </span>
          <div className="flex-1 h-px bg-[#39342A]" />
        </div>

        <input
          type="text"
          value={emailOrPhone}
          onChange={(e) => setEmailOrPhone(e.target.value)}
          placeholder="Email or phone"
          className="w-full bg-[#0B0C10] border border-[#39342A] text-[#EAE1D3] placeholder:text-[#7A7365] text-[12px] font-sans px-3 h-[38px] mb-2.5"
        />

        <button
          onClick={() => onEmailContinue(emailOrPhone)}
          className="w-full bg-[#0B0C10] border border-[#B8860B] text-[#B8860B] font-sans font-bold text-[12px] tracking-[1.2px] uppercase py-3"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
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
