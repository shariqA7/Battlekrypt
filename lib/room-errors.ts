import { NextResponse } from "next/server";
import type { RoomError } from "@/lib/services/rooms";

const MESSAGES: Record<RoomError, [number, string]> = {
  not_found: [404, "Not found."],
  forbidden: [403, "Only the organizer of this tournament can change its rooms."],
  closed: [409, "This tournament is finished or cancelled."],
  invalid: [400, "Check the room details."],
  capacity_below_taken: [409, "That room already has more entries than that."],
  has_entries: [409, "This room still has entries."],
  not_in_tournament: [400, "That room belongs to another tournament."],
  room_full: [409, "That room is full."],
};

export function roomErrorResponse(error: RoomError, message?: string) {
  const [status, fallback] = MESSAGES[error] ?? [400, "Couldn't do that."];
  return NextResponse.json({ error: { code: error, message: message ?? fallback } }, { status });
}
