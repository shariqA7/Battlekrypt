"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";

type Status = "none" | "valid" | "expiring" | "expired" | "other_institute";

interface Props {
  userId: string;
  // Where to send the player back to after saving (e.g. the tournament they were joining).
  next?: string;
  initial: {
    status: Status;
    expiresAt: string | null; // YYYY-MM-DD
    daysLeft: number | null;
    studentId: string | null;
    photoPath: string | null; // the player's own photo, so they can open it
  };
}

const inputClass =
  "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[44px] sm:h-[38px]";
const labelClass = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

const BADGE: Record<Status, { tone: "neutral" | "teal" | "amber" | "danger"; text: (i: Props["initial"]) => string }> = {
  none: { tone: "neutral", text: () => "Not added" },
  valid: { tone: "teal", text: (i) => (i.expiresAt ? `Valid until ${i.expiresAt}` : "Valid") },
  expiring: { tone: "amber", text: (i) => `Expires in ${i.daysLeft} day${i.daysLeft === 1 ? "" : "s"} (${i.expiresAt})` },
  expired: { tone: "danger", text: (i) => `Expired on ${i.expiresAt}` },
  other_institute: { tone: "amber", text: () => "From your previous institute" },
};

const NEEDS_NEW: Status[] = ["none", "expired", "other_institute"];

// The player's student ID card: added once, reused for every tournament that asks
// for one, kept until they remove it. They only add a new one when it expires.
export default function StudentIdCard({ userId, next, initial }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(NEEDS_NEW.includes(initial.status));
  const [path, setPath] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [noExpiry, setNoExpiry] = useState(false);
  const [studentId, setStudentId] = useState(initial.studentId ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  // Best effort: the files are the player's own, so the browser (their login) deletes them.
  async function deleteFile(p: string | null | undefined) {
    if (!p) return;
    await createClient().storage.from("institution-proofs").remove([p]).catch(() => null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!path) return setError("Upload a photo of your student ID first.");
    if (!noExpiry && !expiresAt) return setError("Enter the expiry date on your card, or tick that it has none.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/players/me/student-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, expiresAt: noExpiry ? null : expiresAt, noExpiry, studentId }),
    });
    if (!res.ok) {
      setError((await res.json()).error?.message ?? "Couldn't save your student ID.");
      setBusy(false);
      return;
    }
    const { previousPath, previousPathInUse } = await res.json();
    if (previousPath && !previousPathInUse) await deleteFile(previousPath);
    setBusy(false);
    if (next && next.startsWith("/") && !next.startsWith("//")) return router.push(next);
    setAdding(false);
    setPath("");
    router.refresh();
  }

  async function cancel() {
    // A photo uploaded but never saved shouldn't linger.
    if (path) await deleteFile(path);
    setPath("");
    setError(null);
    setAdding(false);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/players/me/student-id", { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json()).error?.message ?? "Couldn't remove your student ID.");
      setBusy(false);
      setConfirmRemove(false);
      return;
    }
    await deleteFile((await res.json()).path);
    setBusy(false);
    setConfirmRemove(false);
    setAdding(true);
    router.refresh();
  }

  async function view() {
    if (!initial.photoPath) return;
    const { data } = await createClient().storage.from("institution-proofs").createSignedUrl(initial.photoPath, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    else setError("Couldn't open your photo.");
  }

  const b = BADGE[initial.status];
  return (
    <section className="mt-10 border-t border-bk-border pt-6">
      <h2 className="font-sans font-extrabold text-lg text-bk-heading">My student ID</h2>
      <p className="font-sans text-[12px] text-bk-muted mt-1">
        Add it once. It&apos;s used automatically for every tournament that asks for a student ID, and kept until you
        remove it. You only need a new one when it expires. Organizers of tournaments you enter (and admins, if there&apos;s a
        dispute) can see it; nobody else can.
      </p>

      {initial.status !== "none" && (
        <Panel className="mt-4 px-4 py-3 font-sans text-[13px]">
          <p className="flex flex-wrap items-center gap-2 text-bk-heading font-bold">
            Student ID <Badge tone={b.tone}>{b.text(initial)}</Badge>
          </p>
          {initial.studentId && <p className="text-bk-muted mt-1">Student number: {initial.studentId}</p>}
          {initial.status === "other_institute" && (
            <p className="text-bk-muted text-[12px] mt-2">
              This ID was added for your previous institute, so tournaments won&apos;t accept it. Add your new one.
            </p>
          )}
          {initial.status === "expired" && (
            <p className="text-bk-muted text-[12px] mt-2">It has expired. Add your new ID to enter tournaments that ask for one.</p>
          )}
          {!adding && (
            <div className="flex flex-wrap gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={view}>
                View my ID
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                Replace
              </Button>
              <Button variant="ghost" size="sm" className="text-bk-live" onClick={() => setConfirmRemove(true)}>
                Remove
              </Button>
            </div>
          )}
        </Panel>
      )}

      {adding && (
        <form onSubmit={save}>
          <label className={labelClass}>Photo of your student ID</label>
          <FileUpload
            bucket="institution-proofs"
            pathPrefix={userId}
            isPrivate
            label={path ? "Photo uploaded: tap to replace" : "Upload student ID photo"}
            onUploaded={setPath}
          />

          <label className={labelClass}>Expiry date on the card</label>
          <input
            type="date"
            min={today}
            value={noExpiry ? "" : expiresAt}
            disabled={noExpiry}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={inputClass}
          />
          <label className="flex items-center gap-2 mt-2 font-sans text-[12px] text-bk-body">
            <input type="checkbox" checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)} />
            My card has no expiry date
          </label>

          <label className={labelClass}>Student number (optional)</label>
          <input value={studentId} maxLength={40} onChange={(e) => setStudentId(e.target.value)} className={inputClass} />

          {error && <p className="text-bk-live text-[12px] mt-3">{error}</p>}
          <div className="flex gap-2 mt-4">
            <Button type="submit" disabled={busy || !path}>
              Save my ID
            </Button>
            {initial.status !== "none" && (
              <Button variant="outline" disabled={busy} onClick={cancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}

      {!adding && error && <p className="text-bk-live text-[12px] mt-3">{error}</p>}

      {confirmRemove && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-6">
          <Panel className="max-w-sm w-full p-5 font-sans">
            <p className="text-bk-heading font-bold text-[15px]">Remove your student ID?</p>
            <p className="text-bk-body text-[13px] mt-2">
              The photo and details are deleted. Tournaments that ask for a student ID will need you to add it again.
            </p>
            <div className="flex gap-2 mt-4">
              <Button variant="danger" disabled={busy} onClick={remove}>
                Yes, remove it
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmRemove(false)}>
                Keep it
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </section>
  );
}
