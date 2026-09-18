// GET /api/organizer/me/tournaments — own tournaments, all statuses
// Previously only reachable via the dashboard's direct service call —
// exposing it here so a mobile client can fetch the same data.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { getMyTournaments } from "@/lib/services/tournaments";

export async function GET() {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const tournaments = await getMyTournaments(auth.organizerProfile.id);
  return NextResponse.json({ data: tournaments });
}
