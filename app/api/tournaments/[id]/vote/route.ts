// GET  /api/tournaments/:id/vote — public like/dislike counts + the caller's
//      own vote if signed in.
// POST /api/tournaments/:id/vote — { value: "like" | "dislike" }. Player
//      must hold a registration for this tournament (spec §10).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getTournamentVoteSummary, voteOnTournament } from "@/lib/services/tournaments";
import { banGuard } from "@/lib/services/bans";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const playerProfile = user
    ? await prisma.playerProfile.findUnique({ where: { userId: user.id } })
    : null;

  const summary = await getTournamentVoteSummary(id, playerProfile?.id);
  return NextResponse.json(summary);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const banned = await banGuard(user.id);
  if (banned) return banned;

  const playerProfile = await prisma.playerProfile.findUnique({ where: { userId: user.id } });
  if (!playerProfile) {
    return NextResponse.json(
      { error: { code: "not_player", message: "Player profile required." } },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  if (body.value !== "like" && body.value !== "dislike") {
    return NextResponse.json(
      { error: { code: "invalid_value", message: "value must be 'like' or 'dislike'." } },
      { status: 400 }
    );
  }

  const result = await voteOnTournament(id, playerProfile.id, body.value);
  if (result.error === "not_joined") {
    return NextResponse.json(
      {
        error: {
          code: "not_joined",
          message: "Only players who joined this tournament can rate it.",
        },
      },
      { status: 403 }
    );
  }

  return NextResponse.json(result.data);
}
