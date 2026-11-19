"use client";

import { LIMIT_LABELS } from "@/lib/plan-limit-labels";
import { ORGANIZER_LIMIT_ORDER } from "@/lib/custom-plan-rules";

export type LimitValues = Record<string, number | boolean | null>;

// Every organizer plan option as an editable field: a number (with an "Unlimited" tick for the ones
// where empty means unlimited), or a yes/no tick. Used by the "Customize your plan" form and by the
// admin's quote form, so both always list exactly the options plans have.
export default function LimitFields({
  values, onChange, current,
}: { values: LimitValues; onChange: (next: LimitValues) => void; current?: LimitValues }) {
  const input = "w-[110px] bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-2 h-[34px] disabled:opacity-40";
  const keys = ORGANIZER_LIMIT_ORDER.filter((k) => LIMIT_LABELS[k]);
  const show = (v: number | boolean | null | undefined) => (v === null ? "unlimited" : v === true ? "yes" : v === false ? "no" : String(v ?? ""));

  return (
    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
      {keys.map((k) => {
        const meta = LIMIT_LABELS[k];
        const v = values[k];
        return (
          <div key={k} className="flex items-center justify-between gap-3 border-b border-bk-border/60 pb-2">
            <div>
              <p className="font-sans text-[13px] text-bk-heading">{meta.label}</p>
              {current && <p className="font-sans text-[11px] text-bk-muted">Now: {show(current[k])}</p>}
            </div>
            {meta.kind === "flag" ? (
              <input type="checkbox" aria-label={meta.label} checked={v === true} onChange={(e) => onChange({ ...values, [k]: e.target.checked })} />
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} aria-label={meta.label} className={input} disabled={v === null}
                  value={v === null || v === undefined ? "" : String(v)}
                  onChange={(e) => onChange({ ...values, [k]: e.target.value === "" ? 0 : Number(e.target.value) })}
                />
                {meta.kind === "limit" && (
                  <label className="flex items-center gap-1 font-sans text-[11px] text-bk-muted">
                    <input type="checkbox" checked={v === null} onChange={(e) => onChange({ ...values, [k]: e.target.checked ? null : 0 })} /> Unlimited
                  </label>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
