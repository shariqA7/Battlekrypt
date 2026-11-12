"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import {
  FEEDBACK_KIND_LABEL, FEEDBACK_NOTE_MAX, FEEDBACK_STATUSES, FEEDBACK_STATUS_LABEL,
  type FeedbackKindT, type FeedbackStatusT,
} from "@/lib/feedback-rules";

interface Item {
  id: string; kind: string; message: string; pageUrl: string | null; status: string; adminNote: string | null;
  sender: string; senderEmail: string | null; createdAt: string;
}

export default function FeedbackManager({ items }: { items: Item[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(id: string, method: "PATCH" | "DELETE", body?: object) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/admin/feedback/${id}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(null);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    router.refresh();
  }

  if (items.length === 0) return <p className="font-sans text-[13px] text-bk-muted">No feedback here.</p>;
  const field = "bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2 py-1.5";

  return (
    <div className="space-y-3">
      {error && <p className="text-bk-live text-[12px] font-sans" role="alert">{error}</p>}
      {items.map((f) => {
        const curStatus = status[f.id] ?? f.status;
        const curNote = notes[f.id] ?? f.adminNote ?? "";
        const changed = curStatus !== f.status || curNote !== (f.adminNote ?? "");
        return (
          <Panel key={f.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-sans text-[12px] text-bk-muted">
                <span className="text-bk-heading font-bold">{FEEDBACK_KIND_LABEL[f.kind as FeedbackKindT] ?? f.kind}</span>
                {" · "}{f.sender}{f.senderEmail ? ` · ${f.senderEmail}` : ""}{" · "}{new Date(f.createdAt).toLocaleString()}
              </p>
              <span className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-gold-light">{FEEDBACK_STATUS_LABEL[f.status as FeedbackStatusT] ?? f.status}</span>
            </div>
            <p className="font-sans text-[13px] text-bk-heading mt-2 whitespace-pre-wrap break-words">{f.message}</p>
            {f.pageUrl && <p className="font-sans text-[11px] text-bk-muted mt-1">Page: <span className="font-mono">{f.pageUrl}</span></p>}
            <div className="flex flex-wrap items-start gap-2 mt-3">
              <select aria-label="Status" value={curStatus} onChange={(e) => setStatus((s) => ({ ...s, [f.id]: e.target.value }))} className={field}>
                {FEEDBACK_STATUSES.map((s) => <option key={s} value={s}>{FEEDBACK_STATUS_LABEL[s]}</option>)}
              </select>
              <textarea
                aria-label="Note" rows={2} maxLength={FEEDBACK_NOTE_MAX} value={curNote} placeholder="Note (shown to a signed-in sender when you decide)"
                onChange={(e) => setNotes((n) => ({ ...n, [f.id]: e.target.value }))} className={`${field} flex-1 min-w-[220px]`}
              />
              <button disabled={!changed || busy === f.id} onClick={() => call(f.id, "PATCH", { status: curStatus, adminNote: curNote })}
                className="bg-white text-bk-bg font-sans font-bold text-[11px] uppercase tracking-[0.8px] px-3 py-2 disabled:opacity-40">Save</button>
              <button disabled={busy === f.id} onClick={() => { if (confirm("Delete this message for good?")) void call(f.id, "DELETE"); }}
                className="border border-bk-border text-bk-live font-sans text-[11px] uppercase tracking-[0.8px] px-3 py-2 disabled:opacity-40">Delete</button>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
