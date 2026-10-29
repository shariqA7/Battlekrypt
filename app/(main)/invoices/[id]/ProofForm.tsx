"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";

export default function ProofForm({ invoiceId, methods }: { invoiceId: string; methods: { id: string; name: string; type: string }[] }) {
  const router = useRouter();
  const [proofUrl, setProofUrl] = useState("");
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCrypto = methods.find((m) => m.id === methodId)?.type === "crypto";

  async function submit() {
    if (!proofUrl) return setError("Upload your payment screenshot first.");
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/invoices/${invoiceId}/proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proofUrl, methodId: methodId || null, reference }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error?.message ?? "Could not send your proof.");
    router.refresh();
  }

  return (
    <section className="bg-bk-surface border border-bk-border p-4 space-y-3">
      <h2 className="font-sans font-bold text-[15px] text-bk-heading">I have paid</h2>
      {methods.length > 0 && (
        <label className="block font-sans text-[12px] text-bk-muted">
          <span className="block mb-1">Which did you use?</span>
          <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] px-3 h-[36px]">
            {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      )}
      <label className="block font-sans text-[12px] text-bk-muted">
        <span className="block mb-1">{isCrypto ? "Transaction hash" : "Transaction ID / reference"} (optional)</span>
        <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-mono px-3 h-[36px] w-full" />
      </label>
      <FileUpload bucket="tournament-assets" pathPrefix="invoice-proofs" label="Upload payment screenshot" onUploaded={setProofUrl} />
      {error && <p role="alert" className="font-sans text-[12px] text-bk-live">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send for checking"}
      </button>
    </section>
  );
}
