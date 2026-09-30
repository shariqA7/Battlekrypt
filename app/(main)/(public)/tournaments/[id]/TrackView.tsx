"use client";

import { useEffect } from "react";

// Renders nothing — fires once on real mount (not on a Next.js Link
// prefetch, which never runs page JS) to bump the tournament's click count.
// See lib/services/tournaments.ts#incrementTournamentClick.
export default function TrackView({ tournamentId }: { tournamentId: string }) {
  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}/click`, { method: "POST" }).catch(() => null);
    // Intentionally once per mount — no deps beyond the id itself.
  }, [tournamentId]);

  return null;
}
