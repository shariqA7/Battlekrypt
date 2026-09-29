// GET /api/suggested-rules?gameId=… — the suggestions behind the "+" button
// when an organizer adds rules: active ones for every game, plus those for
// the chosen game's category. Organizer-only (they're the only consumers).
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { listSuggestedRules } from "@/lib/services/rules";

export async function GET(request: Request) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const gameId = new URL(request.url).searchParams.get("gameId") ?? undefined;
  return NextResponse.json({ data: await listSuggestedRules(gameId || undefined) });
}
