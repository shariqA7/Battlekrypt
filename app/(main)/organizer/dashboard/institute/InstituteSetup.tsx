"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InstituteSetup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/organizer/institution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setError((await res.json()).error?.message ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border border-bk-border p-4">
      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
        Institute name
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]"
      />
      {error && <p className="text-bk-live text-[12px] mt-2">{error}</p>}
      <button
        disabled={busy || name.trim().length < 2}
        className="mt-3 bg-bk-gold-light text-black font-bold text-[12px] px-4 h-[40px] disabled:opacity-50"
      >
        Register institute
      </button>
    </form>
  );
}
