"use client";

// Day / month / year pickers (no typing, works well on phones). Reports "YYYY-MM-DD" once
// all three are chosen, otherwise "". The server still checks the date is real and old enough.
import { useEffect, useMemo, useState } from "react";
import { Label, fieldClass } from "@/components/auth/fields";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function DobField({ onChange }: { onChange: (isoDate: string) => void }) {
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  const thisYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 100 }, (_, i) => thisYear - i), [thisYear]);
  const daysInMonth = month && year ? new Date(Number(year), Number(month), 0).getDate() : 31;
  const iso = day && month && year ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` : "";

  useEffect(() => { onChange(iso); }, [iso, onChange]);

  return (
    <fieldset>
      <Label>Date of birth</Label>
      <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
        <select aria-label="Day" className={`${fieldClass} px-3`} value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="">Day</option>
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (<option key={d} value={String(d)}>{d}</option>))}
        </select>
        <select aria-label="Month" className={`${fieldClass} px-3`} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">Month</option>
          {MONTHS.map((m, i) => (<option key={m} value={String(i + 1)}>{m}</option>))}
        </select>
        <select aria-label="Year" className={`${fieldClass} px-3`} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">Year</option>
          {years.map((y) => (<option key={y} value={String(y)}>{y}</option>))}
        </select>
      </div>
    </fieldset>
  );
}
