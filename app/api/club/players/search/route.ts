// GET /api/club/players/search?q=… — find players to invite (names only)
import { NextResponse } from "next/server";
import { requireApprovedClub } from "@/lib/club-helpers";
import { searchPlayers } from "@/lib/services/club-roster";

export async function GET(request: Request) {
  const auth = await requireApprovedClub();
  if ("response" in auth) return auth.response;

  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ data: await searchPlayers(q, auth.club.id) });
}
