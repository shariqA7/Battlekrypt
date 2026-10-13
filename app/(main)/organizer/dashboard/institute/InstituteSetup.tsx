"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

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
    <Panel className="p-4">
    <form onSubmit={submit}>
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
      <Button type="submit" className="mt-3" disabled={busy || name.trim().length < 2}>
        Register institute
      </Button>
    </form>
    </Panel>
  );
}
