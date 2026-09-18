// GET /api/organizer/me/game-requests — track status of own submitted requests
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { getMyGameRequests } from "@/lib/services/tournaments";

export async function GET() {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const requests = await getMyGameRequests(auth.organizerProfile.id);
  return NextResponse.json({ data: requests });
}
