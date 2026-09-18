"use client";

import { useState } from "react";

export default function FlagButton({ tournamentId }: { tournamentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (!reason.trim()) return;
    const res = await fetch(`/api/tournaments/${tournamentId}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) setSubmitted(true);
  }

  if (submitted) {
    return <p className="text-bk-muted text-[11px] font-sans">Reported — thank you.</p>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-bk-muted text-[11px] font-sans underline"
      >
        Report this tournament
      </button>
    );
  }

  return (
    <div className="flex gap-2 items-start">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="What's wrong with this listing?"
        className="bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2.5 h-[32px] flex-1"
      />
      <button
        onClick={handleSubmit}
        className="bg-bk-surface border border-bk-border text-bk-body font-sans text-[11px] uppercase px-3 h-[32px] whitespace-nowrap"
      >
        Submit
      </button>
    </div>
  );
}
