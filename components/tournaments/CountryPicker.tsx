"use client";

import { COUNTRIES, REGIONS } from "@/lib/geo-data";

// Where a tournament is aimed or played. Empty = worldwide (open to anyone).
export default function CountryPicker({
  value,
  onChange,
  defaultLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  // When given, adds a first option meaning "use my organization's country".
  defaultLabel?: string;
}) {
  return (
    <div>
      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4">
        Country
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[16px] sm:text-[13px] font-sans px-3 h-[44px] sm:h-[38px]"
      >
        {defaultLabel && <option value="__default">{defaultLabel}</option>}
        <option value="">Worldwide (anyone can join)</option>
        {REGIONS.map((r) => (
          <optgroup key={r.key} label={r.label}>
            {Object.entries(COUNTRIES)
              .filter(([, c]) => c.region === r.key)
              .sort((a, b) => a[1].name.localeCompare(b[1].name))
              .map(([code, c]) => (
                <option key={code} value={code}>
                  {c.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <p className="font-sans text-[11px] text-bk-muted mt-1">
        Players can filter tournaments by country and region. Worldwide events show up for everyone.
      </p>
    </div>
  );
}
