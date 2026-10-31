// POST /api/ratings — rate an organizer after a completed event you took part in
// body: { tournamentId, stars (1-5), comment? }. Rating the same event again changes your rating.
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { banGuard } from "@/lib/services/bans";
import { rateOrganizer } from "@/lib/services/organizer-ratings";

const MESSAGES: Record<string, { status: number; message: string }> = {
  feature_off: { status: 403, message: "Ratings are switched off on this site." },
  not_found: { status: 404, message: "Tournament not found." },
  forbidden: { status: 403, message: "Only players who took part in a completed event can rate its organizer." },
  rate_limited: { status: 429, message: "You've sent a lot of ratings today. Try again tomorrow." },
};

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const banned = await banGuard(auth.user.id);
  if (banned) return banned;

  const b = await request.json().catch(() => ({}));
  const result = await rateOrganizer({ userId: auth.user.id, tournamentId: String(b.tournamentId ?? ""), stars: b.stars, comment: b.comment });
  if ("error" in result) {
    const m = MESSAGES[result.error];
    const message = "message" in result ? result.message : (m?.message ?? "Invalid request.");
    return NextResponse.json({ error: { code: result.error, message } }, { status: m?.status ?? 400 });
  }
  return NextResponse.json({ id: result.data.id, stars: result.data.stars, updated: result.updated }, { status: result.updated ? 200 : 201 });
}
