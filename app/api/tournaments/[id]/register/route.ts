// POST /api/tournaments/:id/register — player joins a tournament
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { registerForTournament } from "@/lib/services/tournaments";

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

  // Every user has a PlayerProfile by default (see spec) — create one
  // on first use if it doesn't exist yet (e.g. signed up via OAuth and
  // this is their first action on the platform).
  let playerProfile = await prisma.playerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!playerProfile) {
    playerProfile = await prisma.playerProfile.create({
      data: { userId: user.id },
    });
  }

  const body = await request.json();

  const result = await registerForTournament({
    tournamentId: id,
    playerId: playerProfile.id,
    customFieldResponses: body.customFieldResponses,
    paymentProofUrl: body.paymentProofUrl,
    teamName: body.teamName,
    teamMemberPlayerIds: body.teamMemberPlayerIds,
  });

  const errorMap: Record<string, { status: number; message: string }> = {
    not_found: { status: 404, message: "Tournament not found." },
    registration_closed: { status: 409, message: "Registration is not open for this tournament." },
    full: { status: 409, message: "This tournament is full." },
    already_registered: { status: 409, message: "You're already registered for this tournament." },
    payment_proof_required: { status: 400, message: "Payment proof is required for a paid tournament." },
  };

  if (result.error) {
    const mapped = errorMap[result.error];
    return NextResponse.json(
      { error: { code: result.error, message: mapped.message } },
      { status: mapped.status }
    );
  }

  return NextResponse.json(result.data, { status: 201 });
}
