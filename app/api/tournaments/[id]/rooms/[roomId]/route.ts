// PATCH  /api/tournaments/:id/rooms/:roomId — the organizer renames a room, moves its start time, or changes its seats.
// DELETE /api/tournaments/:id/rooms/:roomId — remove an empty room.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { deleteRoom, getSeatSummary, updateRoom } from "@/lib/services/rooms";
import { roomErrorResponse } from "@/lib/room-errors";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; roomId: string }> }) {
  const { id, roomId } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const patch: { name?: string | null; startAt?: Date | null; capacity?: number } = {};
  if (body.name !== undefined) patch.name = body.name === null ? null : String(body.name);
  if (body.startAt !== undefined) {
    patch.startAt = body.startAt === null || body.startAt === "" ? null : new Date(body.startAt);
    if (patch.startAt && Number.isNaN(patch.startAt.getTime())) return roomErrorResponse("invalid", "That start time isn't a valid date.");
  }
  if (body.capacity !== undefined) patch.capacity = Number(body.capacity);
  const result = await updateRoom(roomId, auth.organizerProfile.id, patch);
  if ("error" in result && result.error) return roomErrorResponse(result.error, result.message);
  return NextResponse.json(await getSeatSummary(id));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; roomId: string }> }) {
  const { id, roomId } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const result = await deleteRoom(roomId, auth.organizerProfile.id);
  if ("error" in result && result.error) return roomErrorResponse(result.error, result.message);
  return NextResponse.json(await getSeatSummary(id));
}
