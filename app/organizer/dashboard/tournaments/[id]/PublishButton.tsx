"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Mirrors ALLOWED_STATUS_TRANSITIONS in lib/services/tournaments.ts — kept
// here only to populate the dropdown with sensible options; the server is
// the actual source of truth and will reject anything invalid regardless.
const NEXT_STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
  published: [
    { value: "registration_open", label: "Open registration" },
    { value: "registration_closed", label: "Close registration" },
    { value: "in_progress", label: "Mark in progress" },
  ],
  registration_open: [
    { value: "registration_closed", label: "Close registration" },
    { value: "in_progress", label: "Mark in progress" },
  ],
  registration_closed: [{ value: "in_progress", label: "Mark in progress" }],
  in_progress: [{ value: "completed", label: "Mark completed" }],
};

const TERMINAL_STATUSES = ["completed", "cancelled"];

export default function PublishButton({
  tournamentId,
  status,
}: {
  tournamentId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nextStatus, setNextStatus] = useState("");

  async function handlePublish() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/publish`, { method: "POST" });
    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  async function handleStatusChange() {
    if (!nextStatus) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  if (status === "draft") {
    return (
      <div className="text-right">
        <button
          onClick={handlePublish}
          disabled={submitting}
          className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-4 py-2 disabled:opacity-50"
        >
          {submitting ? "Publishing..." : "Publish"}
        </button>
        {error && <p className="text-bk-live text-[11px] font-sans mt-1 max-w-[220px]">{error}</p>}
      </div>
    );
  }

  if (TERMINAL_STATUSES.includes(status)) {
    return (
      <span className="font-sans text-[11px] uppercase tracking-[0.5px] text-bk-muted bg-bk-surface px-2.5 py-1.5">
        {status}
      </span>
    );
  }

  const options = NEXT_STATUS_OPTIONS[status] ?? [];

  return (
    <div className="text-right">
      <div className="flex items-center gap-2">
        <span className="font-sans text-[11px] uppercase tracking-[0.5px] text-bk-gold-light bg-[rgba(244,200,66,0.1)] px-2.5 py-1.5">
          {status.replace("_", " ")}
        </span>
        {options.length > 0 && (
          <>
            <select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value)}
              className="bg-bk-bg border border-bk-border text-bk-heading text-[11px] font-sans px-2 h-[30px]"
            >
              <option value="">Change status...</option>
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleStatusChange}
              disabled={!nextStatus || submitting}
              className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5 disabled:opacity-50"
            >
              Go
            </button>
          </>
        )}
      </div>
      {error && <p className="text-bk-live text-[11px] font-sans mt-1 max-w-[260px]">{error}</p>}
    </div>
  );
}
