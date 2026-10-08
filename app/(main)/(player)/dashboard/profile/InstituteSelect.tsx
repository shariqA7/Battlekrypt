"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  // Where to send the player back to (e.g. the tournament they were joining).
  next?: string;
  // Live tournament entries / challenge applications: they pin the player to their institute.
  activeEntries?: number;
  initial: {
    institutionId: string | null;
    institutionName: string;
    studentId: string | null;
    // ISO date when the institute can next be changed; null if never set.
    changeUnlocksAt: string | null;
  } | null;
}

const inputClass =
  "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
const labelClass =
  "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

export default function InstituteSelect({ initial, next, activeEntries = 0 }: Props) {
  const router = useRouter();
  const hasInstitute = !!initial?.institutionId;
  const unlocksAt = initial?.changeUnlocksAt ? new Date(initial.changeUnlocksAt) : null;
  const locked = hasInstitute && unlocksAt !== null && unlocksAt > new Date();
  const pinned = hasInstitute && activeEntries > 0;

  const [editing, setEditing] = useState(!hasInstitute);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [institutionId, setInstitutionId] = useState(initial?.institutionId ?? "");
  const [studentId, setStudentId] = useState(initial?.studentId ?? "");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!editing) return;
    fetch("/api/institutions")
      .then((r) => r.json())
      .then((j) => setOptions(j.data ?? []))
      .catch(() => setError("Couldn't load institutes."));
  }, [editing]);

  const changing = hasInstitute && institutionId !== initial?.institutionId;

  async function save(acknowledged: boolean) {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/players/me/institution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionId, studentId, acknowledged }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      setConfirming(false);
      return;
    }
    setSubmitting(false);
    setConfirming(false);
    setEditing(false);
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      router.push(next);
      return;
    }
    router.refresh();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!institutionId) {
      setError("Choose your institute.");
      return;
    }
    // Changing an existing institute locks it for a week: make the player
    // read that before it's saved.
    if (changing) setConfirming(true);
    else save(false);
  }

  return (
    <section className="mt-10 border-t border-bk-border pt-6">
      <h2 className="font-sans font-extrabold text-lg text-bk-heading">My institute</h2>
      <p className="font-sans text-[12px] text-bk-muted mt-1">
        You can belong to one institute. Institution-only tournaments are open to the
        participating institutes, and the host institute approves your entry for each tournament.
      </p>

      {!editing && initial && (
        <div className="mt-4 border border-bk-border px-4 py-3 font-sans text-[13px]">
          <p className="text-bk-heading font-bold">{initial.institutionName}</p>
          {initial.studentId && <p className="text-bk-muted">Student ID: {initial.studentId}</p>}
          {pinned ? (
            <p className="text-bk-muted text-[12px] mt-2">
              You can&apos;t change your institute while you&apos;re registered in a tournament or
              challenge. Your institute is responsible for you until it ends.
            </p>
          ) : locked && unlocksAt ? (
            <p className="text-bk-muted text-[12px] mt-2">
              You can change your institute again on {unlocksAt.toLocaleDateString()}.
            </p>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="mt-3 border border-bk-border text-bk-heading text-[12px] font-bold px-4 h-[36px]"
            >
              Change institute
            </button>
          )}
        </div>
      )}

      {editing && (
        <form onSubmit={handleSubmit}>
          {initial && !initial.institutionId && (
            <p className="font-sans text-[12px] text-bk-gold-light mt-3">
              You previously entered &quot;{initial.institutionName}&quot;. Please pick your
              institute from the list.
            </p>
          )}
          <label className={labelClass}>Institute</label>
          <select
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select your institute…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {options.length === 0 && (
            <p className="font-sans text-[12px] text-bk-muted mt-1">
              No verified institutes yet. Ask your institute to register on BattleKrypt.
            </p>
          )}

          <label className={labelClass}>Student ID number (optional)</label>
          <input
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            maxLength={40}
            className={inputClass}
          />

          {error && <p className="text-bk-live text-[12px] mt-3">{error}</p>}
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={submitting}
              className="bg-bk-gold-light text-black font-bold text-[12px] px-5 h-[40px] disabled:opacity-50"
            >
              Save
            </button>
            {hasInstitute && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setInstitutionId(initial?.institutionId ?? "");
                  setError(null);
                }}
                className="border border-bk-border text-bk-heading font-bold text-[12px] px-5 h-[40px]"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-6"
        >
          <div className="bg-bk-bg border border-bk-gold-light/40 max-w-sm w-full p-5 font-sans">
            <p className="text-bk-heading font-bold text-[15px]">Change your institute?</p>
            <p className="text-bk-body text-[13px] mt-2">
              Once you save, you won&apos;t be able to change your institute again for 7 days.
              Make sure{" "}
              <strong>{options.find((o) => o.id === institutionId)?.name ?? "this institute"}</strong>{" "}
              is the right one.
            </p>
            <div className="flex gap-2 mt-4">
              <button
                disabled={submitting}
                onClick={() => save(true)}
                className="bg-bk-gold-light text-black font-bold text-[12px] px-4 h-[40px] disabled:opacity-50"
              >
                Yes, change it
              </button>
              <button
                disabled={submitting}
                onClick={() => setConfirming(false)}
                className="border border-bk-border text-bk-heading font-bold text-[12px] px-4 h-[40px]"
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
