// GET  /api/tournaments/:id/rooms — anyone: the rooms, seats taken, and how many teams are waiting.
// POST /api/tournaments/:id/rooms — the organizer adds rooms.
// Body: { count, capacity, firstStartAt?: ISO date, everyMinutes?: number }
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { createRooms, getSeatSummary, refreshSeats } from "@/lib/services/rooms";
import { roomErrorResponse } from "@/lib/room-errors";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await refreshSeats(id); // release unpaid seats whose time is up before showing the numbers
  const summary = await getSeatSummary(id);
  if (!summary) return NextResponse.json({ error: { code: "not_found", message: "Tournament not found." } }, { status: 404 });
  return NextResponse.json(summary);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const first = body.firstStartAt ? new Date(body.firstStartAt) : null;
  if (first && Number.isNaN(first.getTime())) return roomErrorResponse("invalid", "That start time isn't a valid date.");
  const result = await createRooms(id, auth.organizerProfile.id, {
    count: Number(body.count),
    capacity: Number(body.capacity),
    firstStartAt: first,
    everyMinutes: body.everyMinutes === undefined || body.everyMinutes === "" ? 0 : Number(body.everyMinutes),
  });
  if ("error" in result && result.error) return roomErrorResponse(result.error, result.message);
  return NextResponse.json(await getSeatSummary(id), { status: 201 });
}
