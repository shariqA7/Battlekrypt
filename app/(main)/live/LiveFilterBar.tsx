"use client";

// Same URL-query-param pattern as app/(main)/(public)/tournaments/FilterBar.tsx
// — filters are shareable links, the actual fetch stays server-side in
// page.tsx. Spec §10 calls for game/tournament/organizer filters; organizer
// filtering is handled via a direct link (see the organizer profile page's
// "See live matches" link) rather than a picker, since there's no
// organizer-search endpoint yet.
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Game {
  id: string;
  name: string;
}

export default function LiveFilterBar({ organizerName }: { organizerName?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [games, setGames] = useState<Game[]>([]);
  const [game, setGame] = useState(searchParams.get("game") ?? "");
  const organizerId = searchParams.get("organizerId") ?? "";

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json())
      .then((data) => setGames(data.data ?? []));
  }, []);

  function applyGame(value: string) {
    setGame(value);
    const query = new URLSearchParams();
    if (value) query.set("game", value);
    if (organizerId) query.set("organizerId", organizerId);
    router.push(`/live${query.toString() ? `?${query.toString()}` : ""}`);
  }

  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      <select
        value={game}
        onChange={(e) => applyGame(e.target.value)}
        className="bg-bk-surface border border-bk-border text-bk-heading text-[12px] font-sans px-2 h-[36px]"
      >
        <option value="">All games</option>
        {games.map((g) => (
          <option key={g.id} value={g.name}>
            {g.name}
          </option>
        ))}
      </select>

      {organizerId && (
        <span className="bg-bk-surface border border-bk-border text-bk-body font-sans text-[11px] px-3 py-1.5 flex items-center gap-2">
          {organizerName ?? "This organizer"} only
          <button
            onClick={() => router.push(`/live${game ? `?game=${encodeURIComponent(game)}` : ""}`)}
            className="text-bk-muted underline"
          >
            Clear
          </button>
        </span>
      )}
    </div>
  );
}
