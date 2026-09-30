// GET /api/tournaments/:id/club-entries/search?q=… — organizer-only. Finds a
// club team or solo roster player to manually add, by club/team/player name.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { searchClubEntryCandidates } from "@/lib/services/club-entries";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament || tournament.organizerId !== auth.organizerProfile.id) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "You don't own this tournament." } },
      { status: 403 }
    );
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ data: await searchClubEntryCandidates(id, q) });
}
