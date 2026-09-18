// GET /api/tournaments/:id — full tournament detail, public
// PATCH /api/tournaments/:id — organizer edits a draft
import { NextResponse } from "next/server";
import { getTournamentById, updateTournament } from "@/lib/services/tournaments";
import { requireOrganizer } from "@/lib/auth-helpers";

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json();
  const result = await updateTournament(id, auth.organizerProfile.id, {
    name: body.name,
    description: body.description,
    bannerUrl: body.bannerUrl,
    maxTeams: body.maxTeams,
    playersPerRoom: body.playersPerRoom,
    entryFeeAmount: body.entryFee?.amount,
    entryFeeCurrency: body.entryFee?.currency,
    prizePoolAmount: body.prizePool?.amount,
    prizePoolCurrency: body.prizePool?.currency,
    startAt: body.startAt ? new Date(body.startAt) : undefined,
  });

  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Tournament not found." } },
      { status: 404 }
    );
  }
  if (result.error === "forbidden") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "You don't own this tournament." } },
      { status: 403 }
    );
  }

  return NextResponse.json(result.data);
}
