// GET /api/tournaments/:id — full tournament detail, public
import { NextResponse } from "next/server";
import { getTournamentById } from "@/lib/services/tournaments";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tournament = await getTournamentById(id);

  if (!tournament) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Tournament not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json(tournament);
}
