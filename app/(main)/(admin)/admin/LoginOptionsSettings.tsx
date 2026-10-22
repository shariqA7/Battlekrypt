"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";

// Master switch for "Continue with Twitch". Hides the button on /login and /signup and
// makes the server refuse Twitch sign-ins while it is off.
export default function LoginOptionsSettings({ initialTwitch }: { initialTwitch: boolean }) {
  const [twitch, setTwitch] = useState(initialTwitch);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function save() {
    setSaving(true);
    setStatus("idle");
    const res = await fetch("/api/admin/login-options", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ twitch }),
    });
    setStatus(res.ok ? "saved" : "error");
    setSaving(false);
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">Sign-in options</p>
      <p className="font-sans text-[12px] text-bk-muted mb-3">
        Google and Discord are always on. Turn Twitch on only after the Twitch app and the Supabase
        provider are set up (see SETUP.md), or people will see an error when they try it.
      </p>
      <label className="flex items-center gap-2 font-sans text-[13px] text-bk-body mb-3">
        <input type="checkbox" checked={twitch} onChange={(e) => setTwitch(e.target.checked)} />
        Show &ldquo;Continue with Twitch&rdquo; on the login and sign-up pages
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className={buttonClass("primary", "sm", "")}>
          {saving ? "Saving..." : "Save"}
        </button>
        {status === "saved" && <span className="font-sans text-xs text-bk-muted">Saved.</span>}
        {status === "error" && <span className="font-sans text-xs text-bk-live">Couldn&apos;t save.</span>}
      </div>
    </section>
  );
}
