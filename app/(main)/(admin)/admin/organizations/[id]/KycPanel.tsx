"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DOC_LABEL, ID_BUCKET, type DocType, type FileKind } from "@/lib/identity";

type Revealed = { fullName: string | null; documentNumber: string | null; address: string | null };

const btn = "border border-bk-border text-bk-heading hover:border-bk-gold-light font-sans text-[12px] px-3 min-h-[36px] transition-colors disabled:opacity-50";

// Opens ID photos and shows the kept details. Both go through the server first, which writes
// who looked at what to the admin log; the browser then signs the file with the admin's own login.
export default function KycPanel({
  identityId,
  docType,
  photos,
  instituteId,
  hasProof,
}: {
  identityId: string | null;
  docType: DocType | null;
  photos: { front: boolean; back: boolean; selfie: boolean } | null;
  instituteId: string | null;
  hasProof: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Revealed | null>(null);

  async function post(url: string, body: object) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    return res.json();
  }
  async function openPath(key: string, url: string, body: object) {
    setError(null);
    setBusy(key);
    try {
      const { path } = await post(url, body);
      const { data } = await createClient().storage.from(ID_BUCKET).createSignedUrl(path, 300);
      if (!data?.signedUrl) throw new Error("The file couldn't be opened. Check the admin storage policy in SETUP.md.");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the file.");
    }
    setBusy(null);
  }
  async function reveal() {
    if (!identityId) return;
    setError(null);
    setBusy("reveal");
    try {
      setDetails(await post(`/api/admin/identity/${identityId}/reveal`, {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't show the details.");
    }
    setBusy(null);
  }

  const files: { kind: FileKind; label: string; has: boolean }[] = photos
    ? [
        { kind: "front", label: docType === "passport" ? "Passport page" : "ID front", has: photos.front },
        { kind: "back", label: "ID back", has: photos.back },
        { kind: "selfie", label: "Selfie", has: photos.selfie },
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {identityId &&
          files
            .filter((f) => f.has)
            .map((f) => (
              <button key={f.kind} type="button" disabled={busy !== null} onClick={() => openPath(f.kind, `/api/admin/identity/${identityId}/view`, { kind: f.kind })} className={btn}>
                {busy === f.kind ? "Opening…" : `View ${f.label}`}
              </button>
            ))}
        {instituteId && hasProof && (
          <button type="button" disabled={busy !== null} onClick={() => openPath("proof", `/api/admin/institutions/${instituteId}/proof`, {})} className={btn}>
            {busy === "proof" ? "Opening…" : "View registration document"}
          </button>
        )}
        {identityId && (
          <button type="button" disabled={busy !== null} onClick={reveal} className={btn}>
            {busy === "reveal" ? "Loading…" : "Show kept name, number & address"}
          </button>
        )}
      </div>
      {details && (
        <dl className="grid sm:grid-cols-3 gap-3 border border-bk-border bg-bk-bg p-3 font-sans text-[12px]">
          <div>
            <dt className="text-bk-muted">Name</dt>
            <dd className="text-bk-heading">{details.fullName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-bk-muted">{docType ? DOC_LABEL[docType] : "Document"} number</dt>
            <dd className="text-bk-heading font-mono">{details.documentNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-bk-muted">Address</dt>
            <dd className="text-bk-heading">{details.address ?? "—"}</dd>
          </div>
        </dl>
      )}
      <p className="font-sans text-[11px] text-bk-muted">Every time you open a photo or the kept details it is written to the admin log with your name.</p>
      {error && (
        <p role="alert" className="font-sans text-[12px] text-bk-live">
          {error}
        </p>
      )}
    </div>
  );
}
