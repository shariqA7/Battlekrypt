"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

const inputClass = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[44px] sm:h-[38px]";
const labelClass = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

// Photos go straight from the browser into the PRIVATE bucket, in a folder named
// after the signed-in user (the storage policy enforces that). The server only
// ever receives the paths.
export default function IdentityForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [docType, setDocType] = useState<"nic" | "passport">("nic");
  const [fullName, setFullName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [selfie, setSelfie] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsBack = docType === "nic";
  const ready = Boolean(fullName.trim() && documentNumber.trim() && front && selfie && (!needsBack || back) && consent);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/organizer/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docType, fullName, documentNumber, frontPath: front, backPath: needsBack ? back : null, selfiePath: selfie, consent }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error?.message ?? "Couldn't submit your documents.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <Panel className="p-4 sm:p-5">
      <form onSubmit={submit}>
        <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-2">Document</p>
        <div role="radiogroup" aria-label="Document type" className="grid grid-cols-2 gap-2">
          {([["nic", "National ID card (NIC)"], ["passport", "Passport"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={docType === k}
              onClick={() => setDocType(k)}
              className={`min-h-[44px] px-3 font-sans text-[13px] border transition-colors ${
                docType === k ? "border-bk-gold-light text-bk-gold-light font-bold bg-bk-surface-hover" : "border-bk-border text-bk-body hover:border-bk-border-nav"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className={labelClass} htmlFor="idv-name">Full name (as on the document)</label>
        <input id="idv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} autoComplete="name" className={inputClass} />

        <label className={labelClass} htmlFor="idv-number">{docType === "nic" ? "NIC number" : "Passport number"}</label>
        <input id="idv-number" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} maxLength={30} autoComplete="off" className={`${inputClass} font-mono`} />

        <p className={labelClass}>Photos</p>
        <p className="font-sans text-[12px] text-bk-muted mb-3">Clear, in good light, all four corners visible. Nothing covered.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <UploadSlot label={docType === "nic" ? "Front of the card" : "Photo page of the passport"} done={Boolean(front)}>
            <FileUpload bucket="identity-documents" pathPrefix={userId} isPrivate onUploaded={setFront} label="Choose a photo" />
          </UploadSlot>
          {needsBack && (
            <UploadSlot label="Back of the card" done={Boolean(back)}>
              <FileUpload bucket="identity-documents" pathPrefix={userId} isPrivate onUploaded={setBack} label="Choose a photo" />
            </UploadSlot>
          )}
          <UploadSlot label="Selfie holding the document" done={Boolean(selfie)}>
            <FileUpload bucket="identity-documents" pathPrefix={userId} isPrivate onUploaded={setSelfie} label="Choose a photo" />
          </UploadSlot>
        </div>

        <label className="flex items-start gap-2.5 mt-5 font-sans text-[12px] text-bk-body cursor-pointer">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--bk-gold-light)]" />
          <span>I agree that these documents are used only to verify my identity, as described below, and that I am 18 or older.</span>
        </label>

        {error && <p role="alert" className="text-bk-live text-[12px] mt-3">{error}</p>}
        <Button type="submit" disabled={!ready || busy} className="mt-5 w-full sm:w-auto">
          {busy ? "Submitting..." : "Submit for review"}
        </Button>
      </form>
    </Panel>
  );
}

function UploadSlot({ label, done, children }: { label: string; done: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-sans text-[12px] text-bk-heading mb-1.5 flex items-center gap-2">
        {label}
        {done && <span className="text-bk-teal text-[11px] font-bold">✓ uploaded</span>}
      </p>
      {children}
    </div>
  );
}
