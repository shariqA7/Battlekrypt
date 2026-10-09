// POST /api/tournaments/:id/register — player joins a tournament
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { registerForTournament } from "@/lib/services/tournaments";
import { ensureUserRecord } from "@/lib/ensure-user";
import { banGuard } from "@/lib/services/bans";
import { isOwnProofPath } from "@/lib/services/institutions";

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

  // Every user has a PlayerProfile by default (see spec) — create one
  // on first use if it doesn't exist yet (e.g. signed up via OAuth and
  // this is their first action on the platform).
  // Defensive fallback — the auth callback normally creates this, but a
  // session predating that fix (or an edge case) could still lack it.
  await ensureUserRecord(user);

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
    // Only accepted from the registering user's own folder of the private bucket.
    institutionProofPath: isOwnProofPath(body.institutionProofPath, user.id)
      ? body.institutionProofPath
      : undefined,
  });

  const errorMap: Record<string, { status: number; message: string }> = {
    not_found: { status: 404, message: "Tournament not found." },
    registration_closed: { status: 409, message: "Registration is not open for this tournament." },
    full: { status: 409, message: "This tournament is full." },
    already_registered: { status: 409, message: "You're already registered for this tournament." },
    payment_proof_required: { status: 400, message: "Payment proof is required for a paid tournament." },
    tier_gate: { status: 403, message: "Doesn't meet this tournament's competitive tier requirement." },
    institution_required: { status: 403, message: "This tournament is for verified students only." },
    institution_proof_required: { status: 400, message: "A fresh photo of your student ID is required." },
    institution_mixed_team: { status: 400, message: "All players in a team must belong to the same institute." },
    institution_quota_full: { status: 409, message: "Your institute has no entries left in this tournament." },
  };

  if (result.error) {
    const mapped = errorMap[result.error];
    return NextResponse.json(
      { error: { code: result.error, message: "message" in result && result.message ? result.message : mapped.message } },
      { status: mapped.status }
    );
  }

  return NextResponse.json(result.data, { status: 201 });
}
