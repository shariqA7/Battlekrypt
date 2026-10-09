// POST /api/tournaments/:id/registrations/manual-add — organizer directly
// adds a player by email, bypassing the normal self-registration flow.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { manualAddRegistration } from "@/lib/services/tournaments";
import { manualAddClubTeamEntry, manualAddClubSoloEntry } from "@/lib/services/club-entries";
import { clubEntryError } from "@/lib/club-helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));

  // Club overrides bypass the roster-lock rule (spec §4) — the organizer can
  // add a club team or solo roster player at any point.
  if (typeof body.clubTeamId === "string" && body.clubTeamId) {
    const result = await manualAddClubTeamEntry(
      id,
      auth.organizerProfile.id,
      body.clubTeamId,
      Array.isArray(body.memberPlayerIds) ? body.memberPlayerIds.map(String) : [],
      body.paymentStatus
    );
    if ("error" in result) return clubEntryError(result);
    return NextResponse.json(result.data, { status: 201 });
  }

  if (typeof body.clubPlayerId === "string" && body.clubPlayerId) {
    const result = await manualAddClubSoloEntry(
      id,
      auth.organizerProfile.id,
      body.clubPlayerId,
      body.paymentStatus
    );
    if ("error" in result) return clubEntryError(result);
    return NextResponse.json(result.data, { status: 201 });
  }

  if (!body.playerEmail) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "playerEmail is required." } },
      { status: 400 }
    );
  }

  const result = await manualAddRegistration(
    id,
    auth.organizerProfile.id,
    body.playerEmail,
    body.paymentStatus
  );

  const errorMap: Record<string, { status: number; message: string }> = {
    not_found: { status: 404, message: "Tournament not found." },
    forbidden: { status: 403, message: "You don't own this tournament." },
    player_not_found: { status: 404, message: "No player found with that email." },
    already_registered: { status: 409, message: "This player is already registered." },
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
