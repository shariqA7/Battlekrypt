// PATCH /api/stages/:id/venue — organizer sets a stage's venue (hybrid tournaments)
// Body: { venueType?: "online"|"lan", venueName?, venueAddress?, venueCity?,
//         checkInOpensAt?, checkInClosesAt?, restricted? }
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { parseVenue } from "@/lib/venue-input";
import { updateStageVenue } from "@/lib/services/stages";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const venue = parseVenue(body);
  if (!venue.ok) {
    return NextResponse.json({ error: { code: "validation_error", message: venue.message } }, { status: 400 });
  }

  const result = await updateStageVenue(id, auth.organizerProfile.id, {
    ...venue.value,
    restricted: typeof body.restricted === "boolean" ? body.restricted : undefined,
  });
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "forbidden" ? 403 : result.error === "validation" ? 400 : 409;
    return NextResponse.json({ error: { code: result.error, message: result.message ?? "Couldn't update the stage." } }, { status });
  }
  return NextResponse.json(result.data);
}
