"use client";

// Organizer identity checks. One compact row per submission; the details, the
// ID photos (every opening is logged) and the decision are inside the expanded
// card. Below: decided checks whose photos are still stored, with their
// automatic deletion date and a "keep longer" switch for disputes.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buttonClass } from "@/components/ui/Button";
import { Chip, ExpandAllBar, Expandable, useOpenSet } from "@/components/admin/Expandable";
import { DOC_LABEL, ID_BUCKET, type DocType, type FileKind } from "@/lib/identity";

interface Pending {
  id: string;
  orgName: string;
  email: string | null;
  docType: DocType;
  fullName: string | null;
  documentNumber: string | null;
  hasBack: boolean;
  attemptCount: number;
  submittedAt: string;
  duplicates: { orgName: string; email: string | null; status: string; banned: boolean }[];
}
interface Stored {
  id: string;
  orgName: string;
  email: string | null;
  status: string;
  purgeAfter: string;
  overdue: boolean;
  retentionHold: boolean;
}

const CHECKS = [
  "The name on the document matches the name typed above",
  "The number on the document matches the number typed above",
  "The document is readable, not expired, and not edited",
  "The selfie shows the same person as the document photo",
];

export default function IdentityChecks({ pending, stored }: { pending: Pending[]; stored: Stored[] }) {
  const router = useRouter();
  const set = useOpenSet();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean[]>>({});
  const [over18, setOver18] = useState<Record<string, boolean>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function post(url: string, body: object) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    return res.json();
  }

  // Ask the server first (writes the audit log), then sign the path with the admin's own login.
  async function openFile(id: string, kind: FileKind) {
    setError(null);
    setBusy(`${id}:${kind}`);
    try {
      const { path } = await post(`/api/admin/identity/${id}/view`, { kind });
      const { data } = await createClient().storage.from(ID_BUCKET).createSignedUrl(path, 300);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      else throw new Error("The photo couldn't be opened. Check the admin storage policy in SETUP.md.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the file.");
    }
    setBusy(null);
  }

  async function decide(id: string, body: object) {
    setError(null);
    setBusy(id);
    try {
      await post(`/api/admin/identity/${id}/decision`, body);
      setRejecting(null);
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(null);
  }

  const fileBtn = "border border-bk-border text-bk-heading hover:border-bk-gold-light font-sans text-[12px] px-3 min-h-[40px] sm:min-h-[32px] transition-colors";

  return (
    <div className="space-y-10">
      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-1">Identity checks ({pending.length})</p>
        <p className="font-sans text-[12px] text-bk-muted mb-3">
          Open the photos, tick what matches, then decide. Each opening of a photo is logged with your name. The photos are deleted automatically after the decision.
        </p>
        {error && <p role="alert" className="font-sans text-[12px] text-bk-live mb-3">{error}</p>}
        {pending.length === 0 && <p className="font-sans text-[13px] text-bk-muted">Nothing waiting for review.</p>}

        <ExpandAllBar ids={pending.map((p) => p.id)} set={set} />
        <div className="space-y-2">
          {pending.map((p) => {
            const t = ticks[p.id] ?? CHECKS.map(() => false);
            const allTicked = t.every(Boolean);
            const dup = p.duplicates.length > 0;
            return (
              <Expandable
                key={p.id}
                id={p.id}
                open={set.has(p.id)}
                onToggle={() => set.toggle(p.id)}
                summary={
                  <>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-sans font-bold text-bk-heading">{p.orgName}</span>
                      <Chip>{DOC_LABEL[p.docType]}</Chip>
                      {p.attemptCount > 1 && <Chip tone="amber">attempt {p.attemptCount}</Chip>}
                      {dup && <Chip tone="live">ID already used</Chip>}
                    </span>
                    <span className="block font-sans text-[12px] text-bk-muted truncate mt-0.5">{p.email ?? "no email"}</span>
                  </>
                }
                aside={<span className="font-sans text-[12px] text-bk-muted">{new Date(p.submittedAt).toLocaleDateString()}</span>}
              >
                {dup && (
                  <div className="border border-bk-live/50 bg-bk-live/10 px-3 py-2 mb-4 font-sans text-[12px] text-bk-heading">
                    <p className="font-bold text-bk-live mb-1">This document number was already used by another organizer account:</p>
                    <ul className="list-disc pl-4">
                      {p.duplicates.map((d, i) => (
                        <li key={i}>
                          {d.orgName} ({d.email ?? "no email"}), check {d.status}
                          {d.banned ? " — that account is currently BANNED" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 font-sans text-[12px] mb-4">
                  <dt className="text-bk-muted">Submitted</dt>
                  <dd className="text-bk-body">{new Date(p.submittedAt).toLocaleString()}</dd>
                  <dt className="text-bk-muted">Full name</dt>
                  <dd className="text-bk-heading">{p.fullName}</dd>
                  <dt className="text-bk-muted">Document number</dt>
                  <dd className="text-bk-heading font-mono">{p.documentNumber}</dd>
                </dl>

                <p className="font-sans font-bold text-[10px] uppercase tracking-[1.4px] text-bk-gold-light mb-1.5">Photos (opens in a new tab, 5 minutes)</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <button type="button" className={fileBtn} disabled={busy === `${p.id}:front`} onClick={() => openFile(p.id, "front")}>
                    {p.docType === "nic" ? "Front of card" : "Passport photo page"}
                  </button>
                  {p.hasBack && (
                    <button type="button" className={fileBtn} disabled={busy === `${p.id}:back`} onClick={() => openFile(p.id, "back")}>
                      Back of card
                    </button>
                  )}
                  <button type="button" className={fileBtn} disabled={busy === `${p.id}:selfie`} onClick={() => openFile(p.id, "selfie")}>
                    Selfie
                  </button>
                </div>

                <fieldset className="mb-4">
                  <legend className="font-sans font-bold text-[10px] uppercase tracking-[1.4px] text-bk-gold-light mb-1.5">Checklist</legend>
                  {CHECKS.map((c, i) => (
                    <label key={c} className="flex items-start gap-2 font-sans text-[12px] text-bk-body mb-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={t[i]}
                        onChange={(e) => setTicks((prev) => ({ ...prev, [p.id]: t.map((v, j) => (j === i ? e.target.checked : v)) }))}
                        className="mt-0.5 w-4 h-4 accent-[var(--bk-gold-light)]"
                      />
                      {c}
                    </label>
                  ))}
                  <label className="flex items-start gap-2 font-sans text-[12px] text-bk-heading font-bold mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(over18[p.id])}
                      onChange={(e) => setOver18((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 accent-[var(--bk-gold-light)]"
                    />
                    The document shows this person is 18 or older
                  </label>
                </fieldset>

                {rejecting === p.id && (
                  <div className="mb-3">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      placeholder="Tell the organizer what to fix (they will see this)"
                      className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 mb-2"
                    />
                    <button disabled={busy === p.id || !note.trim()} onClick={() => decide(p.id, { action: "reject", note })} className={buttonClass("danger", "sm", "")}>
                      Send rejection
                    </button>
                  </div>
                )}

                <div className="flex gap-2 pt-3 border-t border-bk-border-soft">
                  <button
                    disabled={busy === p.id || !allTicked || !over18[p.id]}
                    onClick={() => decide(p.id, { action: "approve", over18: true })}
                    className={buttonClass("primary", "sm", "")}
                    title={!allTicked || !over18[p.id] ? "Tick every check first" : undefined}
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy === p.id}
                    onClick={() => setRejecting(rejecting === p.id ? null : p.id)}
                    className="border border-bk-live text-bk-live font-sans font-bold text-[11px] uppercase tracking-[0.5px] px-3 min-h-[40px] sm:min-h-[32px] inline-flex items-center justify-center"
                  >
                    {rejecting === p.id ? "Cancel" : "Reject"}
                  </button>
                </div>
              </Expandable>
            );
          })}
        </div>
      </section>

      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-1">Photos still stored ({stored.length})</p>
        <p className="font-sans text-[12px] text-bk-muted mb-3">
          Decided checks. The photos are deleted automatically on the date shown. Use &ldquo;Keep longer&rdquo; only when they are needed as evidence (a dispute or a ban).
        </p>
        {stored.some((s) => s.overdue) && (
          <p role="alert" className="font-sans text-[12px] text-bk-live border border-bk-live/50 bg-bk-live/10 px-3 py-2 mb-3">
            Some photos are past their deletion date. The scheduled deletion job may not be running: check CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY (see SETUP.md).
          </p>
        )}
        {stored.length === 0 && <p className="font-sans text-[13px] text-bk-muted">No decided photos are stored.</p>}
        <div className="space-y-2">
          {stored.map((s) => (
            <div key={s.id} className="bg-bk-surface border border-bk-border px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-sans font-bold text-bk-heading text-[13px] flex flex-wrap items-center gap-2">
                  {s.orgName}
                  <Chip tone={s.status === "approved" ? "teal" : "live"}>{s.status}</Chip>
                  {s.retentionHold && <Chip tone="amber">kept longer</Chip>}
                  {s.overdue && <Chip tone="live">overdue</Chip>}
                </p>
                <p className="font-sans text-[12px] text-bk-muted truncate">
                  {s.email ?? "no email"} · {s.retentionHold ? "deletion paused" : `deleted on ${new Date(s.purgeAfter).toLocaleDateString()}`}
                </p>
              </div>
              <button
                disabled={busy === s.id}
                onClick={() => decide(s.id, { action: s.retentionHold ? "release" : "hold" })}
                className="border border-bk-border text-bk-heading hover:border-bk-gold-light font-sans text-[12px] px-3 min-h-[40px] sm:min-h-[32px] transition-colors"
              >
                {s.retentionHold ? "Resume deletion" : "Keep longer"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
