"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";

type Kind = { kind: string; label: string; hint: string; blocked: string | null };

export default function DisputeForm({ registrationId, kinds }: { registrationId: string; kinds: Kind[] }) {
  const router = useRouter();
  const firstOpen = kinds.find((k) => !k.blocked)?.kind ?? "";
  const [kind, setKind] = useState(firstOpen);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId, kind, reason, evidenceUrls: evidence }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body?.error?.message ?? "Something went wrong.");
    router.push(`/disputes/${body.id}`);
  }

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="font-sans font-bold text-[13px] text-bk-heading mb-1">What went wrong?</legend>
        {kinds.map((k) => (
          <label key={k.kind} className={`block border px-3 py-2.5 ${k.blocked ? "border-bk-border-soft opacity-60" : kind === k.kind ? "border-bk-gold-light" : "border-bk-border"}`}>
            <input type="radio" name="kind" className="mr-2" value={k.kind} checked={kind === k.kind} disabled={!!k.blocked} onChange={() => setKind(k.kind)} />
            <span className="font-sans text-[13px] text-bk-heading">{k.label}</span>
            <span className="block font-sans text-[11px] text-bk-muted mt-0.5 pl-5">{k.blocked ?? k.hint}</span>
          </label>
        ))}
      </fieldset>

      <label className="block">
        <span className="font-sans font-bold text-[13px] text-bk-heading">What happened?</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={5}
          maxLength={1500}
          className="mt-1 w-full bg-bk-bg border border-bk-border px-3 py-2 font-sans text-[14px] text-bk-heading"
          placeholder="Dates, amounts and anything you've already tried."
        />
      </label>

      <div>
        <p className="font-sans font-bold text-[13px] text-bk-heading mb-1">Evidence (optional, up to 5 screenshots)</p>
        {evidence.length < 5 && (
          <FileUpload bucket="tournament-assets" pathPrefix="dispute-evidence" label="Upload a screenshot" onUploaded={(url) => setEvidence((e) => [...e, url])} />
        )}
        {evidence.length > 0 && <p className="font-sans text-[12px] text-bk-muted mt-1">{evidence.length} uploaded</p>}
      </div>

      {error && <p role="alert" className="font-sans text-[12px] text-bk-live">{error}</p>}
      <button type="button" onClick={submit} disabled={busy || !kind || reason.trim().length < 10} className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[13px] px-5 min-h-[44px] disabled:opacity-50">
        {busy ? "Sending…" : "Open the case"}
      </button>
    </div>
  );
}
