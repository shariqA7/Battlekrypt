"use client";

// Pick favourite games from the catalog (already filtered to the player's country by the
// server). Tiles instead of typed names, so nobody ends up with "pubg" vs "PUBG Mobile".
import { useState } from "react";
import InitialTile from "@/components/ui/InitialTile";
import { fieldClass } from "@/components/auth/fields";

export interface PickerGame {
  name: string;
  genre: string | null;
}

export default function GamePicker({
  games,
  selected,
  onChange,
  max,
}: {
  games: PickerGame[];
  selected: string[];
  onChange: (names: string[]) => void;
  max: number;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? games.filter((g) => g.name.toLowerCase().includes(q) || (g.genre ?? "").toLowerCase().includes(q)) : games;
  const full = selected.length >= max;

  function toggle(name: string) {
    if (selected.includes(name)) onChange(selected.filter((n) => n !== name));
    else if (!full) onChange([...selected, name]);
  }

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search games"
        aria-label="Search games"
        className={`${fieldClass} mb-3`}
      />
      <p className="font-sans text-[12px] text-bk-muted mb-3" aria-live="polite">
        {selected.length} of {max} picked
      </p>
      <div className="grid grid-cols-2 gap-2 max-h-[340px] overflow-y-auto pr-1" role="group" aria-label="Games">
        {shown.map((g) => {
          const on = selected.includes(g.name);
          const blocked = !on && full;
          return (
            <button
              key={g.name}
              type="button"
              onClick={() => toggle(g.name)}
              aria-pressed={on}
              disabled={blocked}
              className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${
                on ? "border-bk-gold-from bg-bk-gold-from/10" : "border-bk-border bg-bk-surface hover:border-bk-gold-from"
              } ${blocked ? "opacity-40" : ""}`}
            >
              <InitialTile name={g.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-[13px] font-bold text-bk-heading truncate">{g.name}</span>
                {g.genre && <span className="block font-sans text-[11px] text-bk-muted truncate">{g.genre}</span>}
              </span>
              {on && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-bk-teal">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}
        {shown.length === 0 && <p className="col-span-2 font-sans text-[13px] text-bk-muted py-4 text-center">No games match.</p>}
      </div>
    </div>
  );
}
