// POST /api/tournaments/:id/register — player joins a tournament
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { registerForTournament } from "@/lib/services/tournaments";
import { ensureUserRecord } from "@/lib/ensure-user";
import { banGuard } from "@/lib/services/bans";

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
  });

  const errorMap: Record<string, { status: number; message: string }> = {
    not_found: { status: 404, message: "Tournament not found." },
    registration_closed: { status: 409, message: "Registration is not open for this tournament." },
    full: { status: 409, message: "This tournament is full." },
    already_registered: { status: 409, message: "You're already registered for this tournament." },
    payment_proof_required: { status: 400, message: "Payment proof is required for a paid tournament." },
    age_restricted: { status: 403, message: "This tournament has a minimum age you don't meet." },
    birth_date_required: { status: 403, message: "Add your date of birth in Profile settings first." },
    tier_gate: { status: 403, message: "Doesn't meet this tournament's competitive tier requirement." },
    institution_required: { status: 403, message: "This tournament is for verified students only." },
    institution_id_required: { status: 403, message: "Add your student ID in your profile to enter this tournament." },
    institution_id_expired: { status: 403, message: "Your student ID has expired. Add your new ID in your profile." },
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
