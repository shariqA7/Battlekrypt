// GET  /api/tournaments  — public browse/search/filter
// POST /api/tournaments  — organizer creates a draft tournament
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listTournaments, createTournament } from "@/lib/services/tournaments";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const result = await listTournaments({
    game: searchParams.get("game") ?? undefined,
    type: (searchParams.get("type") as never) ?? undefined,
    mode: (searchParams.get("mode") as never) ?? undefined,
    entryType: (searchParams.get("entryType") as never) ?? undefined,
    search: searchParams.get("search") ?? undefined,
    page: Number(searchParams.get("page")) || undefined,
    limit: Number(searchParams.get("limit")) || undefined,
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Sign in required." } },
      { status: 401 }
    );
  }

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });

  if (!organizerProfile) {
    return NextResponse.json(
      {
        error: {
          code: "not_organizer",
          message: "Complete organizer onboarding before creating tournaments.",
        },
      },
      { status: 403 }
    );
  }

  const body = await request.json();

  // NOTE: this is intentionally minimal validation for the scaffold.
  // Before real use, replace with a schema validator (e.g. zod) matching
  // the payload shape documented in api-contract-phase1.md.
  if (!body.gameId || !body.name || !body.type || !body.mode || !body.maxTeams || !body.format || !body.entryType) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Missing required fields." } },
      { status: 400 }
    );
  }

  const tournament = await createTournament({
    organizerId: organizerProfile.id,
    gameId: body.gameId,
    name: body.name,
    description: body.description,
    bannerUrl: body.bannerUrl,
    type: body.type,
    mode: body.mode,
    maxTeamSize: body.maxTeamSize,
    maxTeams: body.maxTeams,
    playersPerRoom: body.playersPerRoom,
    format: body.format,
    entryType: body.entryType,
    entryFeeAmount: body.entryFee?.amount,
    entryFeeCurrency: body.entryFee?.currency,
    prizePoolAmount: body.prizePool?.amount,
    prizePoolCurrency: body.prizePool?.currency,
    customFields: body.customFields,
    rules: body.rules,
    startAt: body.startAt ? new Date(body.startAt) : undefined,
  });

  return NextResponse.json(tournament, { status: 201 });
}
