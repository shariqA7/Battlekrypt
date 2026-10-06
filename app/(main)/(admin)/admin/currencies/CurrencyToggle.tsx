"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CurrencyToggle({ code, name, enabled }: { code: string; name: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/currencies/${code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error?.message ?? "Couldn't update.");
    router.refresh();
  }

  return (
    <div className="border border-bk-border bg-bk-surface p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-bk-heading text-sm">{code}</p>
        <p className="font-sans text-[12px] text-bk-muted break-words">{name}</p>
        {error && <p className="font-sans text-[11px] text-bk-live mt-1">{error}</p>}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        className={`shrink-0 h-[38px] px-4 font-sans font-bold text-[11px] uppercase tracking-[0.5px] disabled:opacity-50 ${
          enabled ? "bg-bk-gold-light text-bk-bg" : "border border-bk-border text-bk-muted"
        }`}
      >
        {enabled ? "On" : "Off"}
      </button>
    </div>
  );
}
