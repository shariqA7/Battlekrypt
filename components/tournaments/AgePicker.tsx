"use client";

import { AGE_REQUIREMENTS, type AgeRequirement } from "@/lib/age";

// Youngest player allowed in (the platform's floor is 13). Shared by the
// create and edit forms; the edit form locks it once players have registered.
export default function AgePicker({
  value,
  onChange,
  disabled = false,
  requireConsent = false,
  onConsentChange,
  consentEnabled = false,
}: {
  value: number;
  onChange: (age: AgeRequirement) => void;
  disabled?: boolean;
  requireConsent?: boolean;
  onConsentChange?: (v: boolean) => void;
  /** Guardian consent switch (Admin > Settings > Features). */
  consentEnabled?: boolean;
}) {
  const btn = (active: boolean) =>
    `flex-1 h-[38px] text-[12px] font-sans uppercase tracking-[0.5px] disabled:opacity-60 ${
      active ? "bg-bk-gold-light text-bk-bg" : "bg-bk-surface text-bk-body border border-bk-border"
    }`;
  return (
    <div>
      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4">
        Minimum age
      </label>
      <div className="flex gap-2">
        {AGE_REQUIREMENTS.map((a) => (
          <button key={a} type="button" disabled={disabled} onClick={() => onChange(a)} className={btn(value === a)}>
            {a === 13 ? "Everyone (13+)" : `${a}+`}
          </button>
        ))}
      </div>
      {/* Only offered when the site has parental consent switched on, and only below 18. */}
      {consentEnabled && onConsentChange && value < 18 && (
        <label className="flex items-start gap-3 mt-3 font-sans text-[12px] text-bk-body cursor-pointer">
          <input
            type="checkbox"
            checked={requireConsent}
            disabled={disabled}
            onChange={(e) => onConsentChange(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[var(--bk-gold-from)]"
          />
          <span>
            Players under 18 need a parent or guardian&apos;s consent. They can register, but get room details and check-in only after a
            parent approves (valid for one year).
          </span>
        </label>
      )}
      <p className="font-sans text-bk-muted text-[11px] mt-1.5">
        {disabled
          ? "Players have already registered, so this can no longer be changed."
          : "Every player on an entry must meet it, and must have added a date of birth to their profile."}
      </p>
    </div>
  );
}
