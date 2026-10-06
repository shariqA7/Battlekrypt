"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import { INSTITUTION_BUCKET } from "@/lib/institution-constants";

interface Props {
  userId: string;
  // Where to send the player back to (e.g. the tournament they were joining).
  next?: string;
  initial: {
    institutionName: string;
    studentId: string | null;
    status: "pending" | "approved" | "rejected";
    adminNote: string | null;
  } | null;
}

const inputClass =
  "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
const labelClass =
  "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

export default function InstitutionVerification({ userId, initial, next }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(!initial || initial.status === "rejected");
  const [institutionName, setInstitutionName] = useState(initial?.institutionName ?? "");
  const [studentId, setStudentId] = useState(initial?.studentId ?? "");
  const [idImagePath, setIdImagePath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/players/me/institution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionName, studentId, idImagePath }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="mt-10 border-t border-bk-border pt-6">
      <h2 className="font-sans font-extrabold text-lg text-bk-heading">Institution verification</h2>
      <p className="font-sans text-[12px] text-bk-muted mt-1">
        Verify once to join institution-only tournaments. Your ID photo is private — only
        platform admins can see it.
      </p>

      {initial?.status === "approved" && (
        <p className="mt-4 font-sans text-[13px] text-bk-heading break-words">
          <span className="text-bk-live font-bold">Verified</span> — {initial.institutionName}
        </p>
      )}

      {initial?.status === "pending" && !editing && (
        <div className="mt-4 font-sans text-[13px]">
          <p className="text-bk-gold-light font-bold">Under review</p>
          <p className="text-bk-muted break-words">{initial.institutionName}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 text-[12px] underline text-bk-muted"
          >
            Edit and resubmit
          </button>
        </div>
      )}

      {initial?.status === "rejected" && (
        <p className="mt-4 font-sans text-[13px] text-bk-live break-words">
          Not approved{initial.adminNote ? `: ${initial.adminNote}` : "."} Fix it below and resubmit.
        </p>
      )}

      {next && initial && initial.status !== "rejected" && !editing && (
        <a
          href={next}
          className="mt-4 block sm:inline-block text-center bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-5 py-3"
        >
          {initial.status === "approved" ? "Back to the tournament" : "Back (we'll notify you once reviewed)"}
        </a>
      )}

      {editing && (
        <form onSubmit={handleSubmit}>
          <label className={labelClass}>School / college / university *</label>
          <input
            required
            value={institutionName}
            onChange={(e) => setInstitutionName(e.target.value)}
            className={inputClass}
          />
          <label className={labelClass}>Student ID number</label>
          <input
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className={inputClass}
          />
          <label className={labelClass}>Photo of your student ID *</label>
          <FileUpload
            bucket={INSTITUTION_BUCKET}
            pathPrefix={userId}
            isPrivate
            label={idImagePath ? "Photo uploaded — tap to replace" : "Upload ID photo"}
            onUploaded={setIdImagePath}
          />
          {error && <p className="text-bk-live text-[12px] font-sans mt-3">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !idImagePath}
            className="mt-4 w-full sm:w-auto bg-bk-gold-light text-black font-sans font-bold text-[13px] px-5 h-[44px] disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit for review"}
          </button>
        </form>
      )}
    </section>
  );
}
