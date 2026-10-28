"use client";

import { DURATION_PRESETS, type PlanDuration } from "@/lib/plan-duration";

// Picks how long a plan lasts: a preset (1 month … 3 years), a custom end date,
// a custom number of days, or no expiry. Controlled: the parent holds the value
// as a string key plus the optional custom field.
export type DurationChoice = { choice: string; date: string; days: string };

export const DEFAULT_DURATION: DurationChoice = { choice: "m12", date: "", days: "" };

export function toPlanDuration(d: DurationChoice): PlanDuration | undefined {
  if (d.choice === "permanent") return { kind: "permanent" };
  if (d.choice === "until") return { kind: "until", date: d.date };
  if (d.choice === "days") return { kind: "days", days: Number(d.days) };
  const preset = DURATION_PRESETS.find((p) => `m${(p.value as { months: number }).months}` === d.choice);
  return preset?.value;
}

const field = "bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2 h-[34px]";

export default function DurationPicker({ value, onChange }: { value: DurationChoice; onChange: (v: DurationChoice) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.choice}
        onChange={(e) => onChange({ ...value, choice: e.target.value })}
        className={field}
        aria-label="How long the plan lasts"
      >
        {DURATION_PRESETS.map((p) => (
          <option key={p.label} value={`m${(p.value as { months: number }).months}`}>
            {p.label}
          </option>
        ))}
        <option value="days">Custom number of days</option>
        <option value="until">Until a date</option>
        <option value="permanent">No expiry</option>
      </select>
      {value.choice === "days" && (
        <input
          type="number"
          min={1}
          max={3650}
          value={value.days}
          onChange={(e) => onChange({ ...value, days: e.target.value })}
          placeholder="days"
          className={`${field} w-24`}
          aria-label="Number of days"
        />
      )}
      {value.choice === "until" && (
        <input
          type="date"
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
          className={field}
          aria-label="End date"
        />
      )}
    </div>
  );
}
