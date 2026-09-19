"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RequestGameForm() {
  const router = useRouter();
  const [gameName, setGameName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/games/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameName }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }

    setGameName("");
    setSubmitted(true);
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        required
        value={gameName}
        onChange={(e) => {
          setGameName(e.target.value);
          setSubmitted(false);
        }}
        placeholder="e.g. Apex Legends"
        className="flex-1 bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]"
      />
      <button
        type="submit"
        disabled={submitting}
        className="bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.5px] uppercase px-4 disabled:opacity-50"
      >
        {submitting ? "..." : "Request"}
      </button>
      {error && <p className="text-bk-live text-[11px] font-sans">{error}</p>}
      {submitted && <p className="text-bk-gold-light text-[11px] font-sans">Submitted!</p>}
    </form>
  );
}
