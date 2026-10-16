"use client";

// Snapshots this tournament's current config (game, type, mode, capacity,
// entry fee, currency, rules, stage names, custom fields — everything except
// date and room credentials) as a new, reusable template. Works at any
// status, including after the tournament has already run.
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";

export default function SaveAsTemplateButton({ tournamentId }: { tournamentId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus("idle");
    const res = await fetch(`/api/tournaments/${tournamentId}/save-as-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage((await res.json()).error.message);
      setStatus("error");
      return;
    }
    setStatus("saved");
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center h-[40px] sm:h-[34px] px-3 font-sans font-bold text-[11px] uppercase tracking-[1.2px] border border-bk-gold-to text-bk-gold-light hover:bg-bk-gold-from/10"
      >
        Save as template
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        required
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name"
        className="bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2 h-[34px]"
      />
      <button
        type="submit"
        disabled={busy}
        className={buttonClass("primary", "sm", "")}
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="font-sans text-bk-muted text-[10px] uppercase tracking-[0.5px] px-1"
      >
        Cancel
      </button>
      {status === "error" && <span className="text-bk-live text-[11px] font-sans">{message}</span>}
    </form>
  );
}
