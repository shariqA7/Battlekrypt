"use client";

// Client component: reads/writes URL query params so filters are
// shareable/bookmarkable links, and the actual data fetch stays server-side
// in page.tsx (no client-side data fetching duplicated here).
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { COUNTRIES, REGIONS } from "@/lib/geo-data";

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
  const [place, setPlace] = useState(
    searchParams.get("country") ? `c:${searchParams.get("country")}` : searchParams.get("region") ? `r:${searchParams.get("region")}` : ""
  );
  const [venueType, setVenueType] = useState(searchParams.get("venueType") ?? "");
  const [audienceScope, setAudienceScope] = useState(searchParams.get("audienceScope") ?? "");

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json())
      .then((data) => setGames(data.data ?? []));
  }, []);

  function applyFilters(overrides: Record<string, string> = {}) {
    const { place: placeOverride, ...rest } = overrides;
    const next = { search, game, entryType, type, mode, audienceScope, venueType, ...rest };
    const query = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    // "c:PK" = one country, "r:south-asia" = a whole region.
    const p = placeOverride ?? place;
    if (p.startsWith("c:")) query.set("country", p.slice(2));
    if (p.startsWith("r:")) query.set("region", p.slice(2));
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
        <select
          value={place}
          onChange={(e) => {
            setPlace(e.target.value);
            applyFilters({ place: e.target.value });
          }}
          aria-label="Region or country"
          className="bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2 h-[36px] max-w-[130px] sm:max-w-none"
        >
          <option value="">Everywhere</option>
          {REGIONS.map((r) => (
            <optgroup key={r.key} label={r.label}>
              <option value={`r:${r.key}`}>All of {r.label}</option>
              {Object.entries(COUNTRIES)
                .filter(([, c]) => c.region === r.key)
                .sort((a, b) => a[1].name.localeCompare(b[1].name))
                .map(([code, c]) => (
                  <option key={code} value={`c:${code}`}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
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
        {["", "online", "lan", "hybrid"].map((val) => (
          <button
            key={val || "all-venues"}
            onClick={() => {
              setVenueType(val);
              applyFilters({ venueType: val });
            }}
            className={pillClass(venueType === val)}
          >
            {val === "" ? "Any venue" : val === "lan" ? "LAN" : val === "hybrid" ? "Hybrid" : "Online"}
          </button>
        ))}
        {["", "institution"].map((val) => (
          <button
            key={val || "all-audience"}
            onClick={() => {
              setAudienceScope(val);
              applyFilters({ audienceScope: val });
            }}
            className={pillClass(audienceScope === val)}
          >
            {val === "" ? "Any audience" : "Students only"}
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
