"use client";

// The result of the server's checks, shown at the TOP of the form. A green tick means a
// check passed, a red cross means it failed. Colours are theme tokens (bk-teal / bk-live),
// so they follow light and dark mode. When something failed, the failed checks lead and
// the passed ones fold away; when everything passed, one green line is shown.
import { useState } from "react";

export interface PanelCheck {
  id: string;
  ok: boolean;
  message: string;
}

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-bk-teal">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <path d="M7.5 12.5l3 3 6-6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Cross() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-bk-live">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export default function ResultPanel({
  checks,
  successMessage,
}: {
  checks: PanelCheck[] | null;
  successMessage?: string;
}) {
  const [showPassed, setShowPassed] = useState(false);
  if (!checks || checks.length === 0) return null;

  const failed = checks.filter((c) => !c.ok);
  const passed = checks.filter((c) => c.ok);
  const allGood = failed.length === 0;

  return (
    <div
      role={allGood ? "status" : "alert"}
      aria-live="polite"
      className={`mb-5 rounded-xl border p-3.5 ${allGood ? "border-bk-teal/50 bg-bk-teal/10" : "border-bk-live/50 bg-bk-live-bg"}`}
    >
      {allGood ? (
        <p className="flex items-center gap-2 font-sans text-[13px] font-medium text-bk-teal">
          <Tick />
          {successMessage ?? "All checks passed"}
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {failed.map((c) => (
              <li key={c.id} className="flex items-start gap-2 font-sans text-[13px] text-bk-live">
                <span className="mt-px">
                  <Cross />
                </span>
                {c.message}
              </li>
            ))}
          </ul>
          {passed.length > 0 && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setShowPassed((v) => !v)}
                className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted hover:text-bk-body"
                aria-expanded={showPassed}
              >
                {showPassed ? "Hide" : "Show"} {passed.length} passed
              </button>
              {showPassed && (
                <ul className="mt-2 space-y-1.5">
                  {passed.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 font-sans text-[12px] text-bk-teal">
                      <span className="mt-px">
                        <Tick />
                      </span>
                      {c.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { Tick as TickIcon, Cross as CrossIcon };
