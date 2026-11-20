// PATCH /api/registrations/:id/room — the organizer moves an entry to another room. Body: { roomId }
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { moveEntryToRoom } from "@/lib/services/rooms";
import { roomErrorResponse } from "@/lib/room-errors";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  if (typeof body.roomId !== "string" || !body.roomId) return roomErrorResponse("invalid", "Choose a room.");
  const result = await moveEntryToRoom(id, auth.organizerProfile.id, body.roomId);
  if ("error" in result && result.error) return roomErrorResponse(result.error, result.message);
  return NextResponse.json({ ok: true });
}
