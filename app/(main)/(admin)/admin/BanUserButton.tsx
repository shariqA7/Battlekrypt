"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DURATIONS = [
  { label: "1 day", value: "1" },
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "1 year", value: "365" },
  { label: "Permanent", value: "permanent" },
];

// Direct ban from the users list. The user can still sign in, but only sees
// the reason and the support contact until the ban ends or is lifted.
export default function BanUserButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, days: days === "permanent" ? null : Number(days) }),
    });
    if (!res.ok) setError((await res.json()).error.message);
    else {
      setOpen(false);
      setReason("");
      router.refresh();
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="font-sans text-[12px] text-bk-live underline">
        Ban
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 min-w-[220px]">
      <p className="font-sans text-[11px] text-bk-muted">Ban {name}</p>
      <select value={days} onChange={(e) => setDays(e.target.value)} className="bg-bk-bg border border-bk-border text-bk-heading text-[12px] px-2 h-[30px]">
        {DURATIONS.map((d) => (
          <option key={d.value} value={d.value}>{d.label}</option>
        ))}
      </select>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason (the user will see this)" className="bg-bk-bg border border-bk-border text-bk-heading text-[12px] px-2 py-1" />
      {error && <p className="font-sans text-[11px] text-bk-live">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={submit} className="bg-bk-live text-white font-sans font-bold text-[11px] uppercase px-2.5 py-1 disabled:opacity-50">Ban</button>
        <button onClick={() => setOpen(false)} className="font-sans text-[12px] text-bk-muted underline">Cancel</button>
      </div>
    </div>
  );
}
