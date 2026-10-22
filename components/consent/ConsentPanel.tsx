"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import LocalDate from "@/components/ui/LocalDate";

export type PanelConsentState = "approved" | "pending" | "declined" | "expired" | "withdrawn" | "none";

const COPY: Record<PanelConsentState, { tone: "teal" | "amber" | "danger"; label: string; text: string }> = {
  approved: { tone: "teal", label: "Approved", text: "Your parent or guardian has approved. You can join tournaments, scrims, leagues and challenges." },
  pending: { tone: "amber", label: "Waiting for your parent", text: "We emailed your parent or guardian. Until they approve you can browse, but you can't join anything." },
  declined: { tone: "danger", label: "Declined", text: "Your parent or guardian declined. You can send a new request if that changes." },
  expired: { tone: "amber", label: "Expired", text: "The last approval has run out (they last one year). Ask your parent or guardian again." },
  withdrawn: { tone: "danger", label: "Withdrawn", text: "Your parent or guardian withdrew permission. You can still browse, but you can't join anything until they approve again. You can send a new request." },
  none: { tone: "amber", label: "Needed", text: "Because you're under 18, a parent or guardian has to approve your account before you can join tournaments, scrims, leagues or challenges. You can browse in the meantime." },
};

// Shown to a player under 18 where a tournament asks for consent. Sends the
// request email; never shows the guardian's full address back.
export default function ConsentPanel({
  state,
  validUntil,
  guardianEmailMasked,
  requestedFor,
}: {
  state: PanelConsentState;
  validUntil?: string | null;
  guardianEmailMasked?: string | null;
  requestedFor?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ testMode: boolean } | null>(null);
  const [open, setOpen] = useState(state === "none");

  const copy = COPY[state];

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/players/me/consent/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guardianEmail: email, requestedFor }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body?.error?.message ?? "Couldn't send the request.");
      return;
    }
    setSent({ testMode: !!body.testMode });
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="bg-bk-surface border border-bk-border p-4">
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <p className="font-sans font-bold text-[13px] text-bk-heading">Parent or guardian consent</p>
        <Badge tone={copy.tone}>{copy.label}</Badge>
      </div>
      <p className="font-sans text-bk-body text-[12px]">
        {sent ? "Request sent. Ask your parent or guardian to check their inbox (and spam)." : copy.text}
        {state === "approved" && validUntil && (
          <>
            {" "}Valid until <LocalDate iso={validUntil} />.
          </>
        )}
        {state === "pending" && guardianEmailMasked && !sent && <> Sent to {guardianEmailMasked}.</>}
      </p>
      {sent?.testMode && (
        <p className="font-sans text-bk-muted text-[11px] mt-1">Test mode: the email went to the site owner&apos;s inbox, not a real parent.</p>
      )}

      {state !== "approved" && (
        <>
          {!open ? (
            <button type="button" onClick={() => setOpen(true)} className={buttonClass("outline", "sm", "mt-3")}>
              {state === "pending" || sent ? "Send to a different email" : "Ask my parent or guardian"}
            </button>
          ) : (
            <form onSubmit={send} className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Parent or guardian's email"
                autoComplete="off"
                className="sm:flex-1 min-w-0 bg-bk-bg border border-bk-border px-3 h-[44px] sm:h-[40px] font-sans text-[13px] text-bk-heading outline-none focus:border-bk-gold-from"
              />
              <button type="submit" disabled={busy} className={buttonClass("primary", "sm", "w-full sm:w-auto")}>
                {busy ? "Sending…" : "Send request"}
              </button>
            </form>
          )}
          {error && <p className="text-bk-live text-[12px] font-sans mt-2">{error}</p>}
        </>
      )}
    </div>
  );
}
