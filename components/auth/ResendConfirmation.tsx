"use client";

// "Didn't get the email?" Sends the confirmation link again, with a short wait between
// sends so it can't be hammered.
import { useEffect, useState } from "react";

const COOLDOWN_SECONDS = 60;

export default function ResendConfirmation({ email, redirectTo = "/" }: { email: string; redirectTo?: string }) {
  const [wait, setWait] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function resend() {
    setMsg(null);
    setWait(COOLDOWN_SECONDS);
    try {
      const res = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectTo }),
      });
      const data = await res.json();
      setMsg({ ok: !!data.ok, text: data.checks?.[0]?.message ?? "Done." });
      if (!data.ok && res.status === 429) setWait(0);
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server. Please try again." });
      setWait(0);
    }
  }

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={resend}
        disabled={wait > 0}
        className="font-sans text-[13px] text-bk-gold-light underline underline-offset-2 disabled:text-bk-muted disabled:no-underline"
      >
        {wait > 0 ? `Send again in ${wait}s` : "Didn't get it? Send it again"}
      </button>
      {msg && <p className={`font-sans text-[12px] mt-2 ${msg.ok ? "text-bk-teal" : "text-bk-live"}`} role="status">{msg.text}</p>}
    </div>
  );
}
