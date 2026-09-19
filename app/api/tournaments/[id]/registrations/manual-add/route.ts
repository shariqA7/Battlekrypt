// POST /api/tournaments/:id/registrations/manual-add — organizer directly
// adds a player by email, bypassing the normal self-registration flow.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { manualAddRegistration } from "@/lib/services/tournaments";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
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
