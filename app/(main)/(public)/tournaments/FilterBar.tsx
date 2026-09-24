"use client";

// Client component: reads/writes URL query params so filters are
// shareable/bookmarkable links, and the actual data fetch stays server-side
// in page.tsx (no client-side data fetching duplicated here).
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Game {
  id: string;
  name: string;
}

export default function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [games, setGames] = useState<Game[]>([]);

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [game, setGame] = useState(searchParams.get("game") ?? "");
  const [entryType, setEntryType] = useState(searchParams.get("entryType") ?? "");
  const [type, setType] = useState(searchParams.get("type") ?? "");
  const [mode, setMode] = useState(searchParams.get("mode") ?? "");

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json())
      .then((data) => setGames(data.data ?? []));
  }, []);

  function applyFilters(overrides: Record<string, string> = {}) {
    const next = { search, game, entryType, type, mode, ...overrides };
    const query = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    router.push(`/tournaments${query.toString() ? `?${query.toString()}` : ""}`);
  }

  const pillClass = (active: boolean) =>
    `font-sans text-[11px] uppercase tracking-[0.5px] px-3 py-1.5 whitespace-nowrap ${
      active ? "bg-bk-gold-light text-bk-bg" : "bg-bk-surface text-bk-body border border-bk-border"
    }`;

  return (
    <div className="bg-bk-surface border border-bk-border p-3 mb-6">
      <div className="flex gap-2 mb-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          placeholder="Search tournaments..."
          className="flex-1 bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]"
        />
        <select
          value={game}
          onChange={(e) => {
            setGame(e.target.value);
            applyFilters({ game: e.target.value });
          }}
          className="bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2 h-[36px]"
        >
          <option value="">All games</option>
          {games.map((g) => (
            <option key={g.id} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => applyFilters()}
          className="bg-white text-bk-bg font-sans font-bold text-[12px] px-4"
        >
          Search
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {["", "free", "paid"].map((val) => (
          <button
            key={val || "all"}
            onClick={() => {
              setEntryType(val);
              applyFilters({ entryType: val });
            }}
            className={pillClass(entryType === val)}
          >
            {val === "" ? "Any entry" : val}
          </button>
        ))}
        {["", "tournament", "league", "scrim"].map((val) => (
          <button
            key={val || "all-types"}
            onClick={() => {
              setType(val);
              applyFilters({ type: val });
            }}
            className={pillClass(type === val)}
          >
            {val === "" ? "Any type" : val}
          </button>
        ))}
        {["", "solo", "duo", "squad"].map((val) => (
          <button
            key={val || "all-modes"}
            onClick={() => {
              setMode(val);
              applyFilters({ mode: val });
            }}
            className={pillClass(mode === val)}
          >
            {val === "" ? "Any mode" : val}
          </button>
        ))}
      </div>
    </div>
  );
}
