"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3";
const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5";

export default function ClaimForm() {
  const router = useRouter();
  const [clubName, setClubName] = useState("");
  const [explanation, setExplanation] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/club-name-claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubName, explanation, evidenceUrl }),
    });
    if (!res.ok) {
      setMessage({ text: (await res.json()).error.message, error: true });
    } else {
      setMessage({ text: "Claim sent. An admin will review it.", error: false });
      setClubName("");
      setExplanation("");
      setEvidenceUrl("");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="bg-bk-surface border border-bk-border p-6">
      <label className={label}>Name being used</label>
      <input required value={clubName} onChange={(e) => setClubName(e.target.value)} className={`${input} h-[38px] mb-4`} placeholder="Falcon" />

      <label className={label}>Why is this name yours?</label>
      <textarea
        required
        rows={5}
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        className={`${input} py-2 mb-4`}
        placeholder="Your organization or team, since when you've used the name, where it appears (website, socials, past tournaments)…"
      />

      <label className={label}>Proof link (optional)</label>
      <input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} className={`${input} h-[38px] mb-4`} placeholder="https://" />

      {message && (
        <p className={`font-sans text-[12px] mb-3 ${message.error ? "text-bk-live" : "text-bk-gold-light"}`}>{message.text}</p>
      )}
      <button disabled={busy} className="w-full bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 disabled:opacity-50">
        {busy ? "Sending…" : "Send claim"}
      </button>
    </form>
  );
}
