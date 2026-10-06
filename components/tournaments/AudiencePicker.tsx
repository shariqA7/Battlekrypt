"use client";

// Who can enter: everyone, or verified students only (spec §8). Shared by the
// create and edit forms.
export type AudienceScopeValue = "open" | "institution";

export default function AudiencePicker({
  scope,
  freshProof,
  onChange,
}: {
  scope: AudienceScopeValue;
  freshProof: boolean;
  onChange: (scope: AudienceScopeValue, freshProof: boolean) => void;
}) {
  const btn = (active: boolean) =>
    `flex-1 h-[38px] text-[12px] font-sans uppercase tracking-[0.5px] ${
      active ? "bg-bk-gold-light text-bk-bg" : "bg-bk-surface text-bk-body border border-bk-border"
    }`;

  return (
    <div>
      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4">
        Who can enter
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => onChange("open", false)} className={btn(scope === "open")}>
          Everyone
        </button>
        <button
          type="button"
          onClick={() => onChange("institution", freshProof)}
          className={btn(scope === "institution")}
        >
          Students only
        </button>
      </div>

      {scope === "institution" && (
        <>
          <p className="font-sans text-[11px] text-bk-muted mt-2">
            Only players with a verified institution can register — every player on a team
            entry must be verified.
          </p>
          <label className="flex items-start gap-2 mt-3 font-sans text-[12px] text-bk-body">
            <input
              type="checkbox"
              checked={freshProof}
              onChange={(e) => onChange("institution", e.target.checked)}
              className="mt-0.5"
            />
            <span>Also ask for a fresh photo of their student ID when they register</span>
          </label>
        </>
      )}
    </div>
  );
}
