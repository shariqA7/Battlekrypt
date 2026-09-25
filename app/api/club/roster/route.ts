// GET /api/club/roster — the club's teams (with members + coach) and solo players
import { NextResponse } from "next/server";
import { requireApprovedClub } from "@/lib/club-helpers";
import { getClubRoster } from "@/lib/services/club-roster";

export async function GET() {
  const auth = await requireApprovedClub();
  if ("response" in auth) return auth.response;

  return NextResponse.json(await getClubRoster(auth.club.id));
}
