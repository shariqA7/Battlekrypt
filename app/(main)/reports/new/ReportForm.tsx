"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
const inputClass = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
const labelClass = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";
import { REPORT_KINDS, REPORT_KIND_LABEL } from "@/lib/report-kinds";

export default function ReportForm({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<string>(REPORT_KINDS[0]);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId, kind, description }),
    });
    setBusy(false);
    if (res.ok) return router.push("/reports");
    setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
  }

  return (
    <form onSubmit={submit}>
      <label className={labelClass}>What happened?</label>
      <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
        {REPORT_KINDS.map((k) => (
          <option key={k} value={k}>
            {REPORT_KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <label className={labelClass}>Details</label>
      <textarea
        required
        minLength={10}
        maxLength={1500}
        rows={6}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="When did you pay, how much, to whom, and what happened next?"
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2"
      />
      {error && <p className="text-bk-live text-[12px] font-sans mt-3">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full mt-6 bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 disabled:opacity-50"
      >
        {busy ? "Sending..." : "Send report"}
      </button>
    </form>
  );
}
