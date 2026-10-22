"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DiscordIcon, GoogleIcon, TwitchIcon } from "@/components/auth/BrandIcons";

type Provider = "google" | "discord" | "twitch";

// A row of icon buttons. Google and Discord are always there; Twitch only when an admin
// has switched it on (Admin > Settings). The server refuses Twitch sign-ins while it is
// off, so hiding the button is a convenience, not the protection.
export default function SocialLogin({
  redirectTo,
  twitchEnabled,
  onError,
}: {
  redirectTo: string;
  twitchEnabled: boolean;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<Provider | null>(null);

  async function start(provider: Provider) {
    setBusy(provider);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      },
    });
    if (error) {
      setBusy(null);
      onError(`Couldn't start ${provider[0].toUpperCase()}${provider.slice(1)} sign-in. Please try again.`);
    }
  }

  const btn =
    "w-14 h-14 rounded-xl bg-bk-primary text-bk-on-primary flex items-center justify-center transition-all hover:opacity-90 hover:-translate-y-px active:translate-y-0 disabled:opacity-50";

  return (
    <div className="flex items-center justify-center gap-3" role="group" aria-label="Sign in with">
      <button type="button" className={btn} onClick={() => start("google")} disabled={busy !== null} aria-label="Continue with Google">
        <span className="bg-white rounded-md p-1 flex"><GoogleIcon size={22} /></span>
      </button>
      <button type="button" className={btn} onClick={() => start("discord")} disabled={busy !== null} aria-label="Continue with Discord">
        <DiscordIcon size={24} />
      </button>
      {twitchEnabled && (
        <button type="button" className={btn} onClick={() => start("twitch")} disabled={busy !== null} aria-label="Continue with Twitch">
          <TwitchIcon size={22} />
        </button>
      )}
    </div>
  );
}

export function OrDivider({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <span className="flex-1 h-px bg-bk-border" />
      <span className="font-sans text-[12px] text-bk-muted">{children}</span>
      <span className="flex-1 h-px bg-bk-border" />
    </div>
  );
}
