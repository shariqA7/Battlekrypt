// GET /api/stages/:id/room — approved registrant only, time-gated
// Returns 403 with revealAt until the countdown is actually over, so there's
// no way to see the room ID/password early by inspecting network requests.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getRoomForPlayer } from "@/lib/services/tournaments";

export async function GET(
  _request: Request,
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

  const playerProfile = await prisma.playerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!playerProfile) {
    return NextResponse.json(
      { error: { code: "not_registered", message: "You're not registered for this tournament." } },
      { status: 403 }
    );
  }

  const result = await getRoomForPlayer(id, playerProfile.id);

  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Stage not found." } },
      { status: 404 }
    );
  }
  if (result.error === "not_registered") {
    return NextResponse.json(
      { error: { code: "not_registered", message: "You're not approved for this tournament." } },
      { status: 403 }
    );
  }
  if (result.error === "room_not_set") {
    return NextResponse.json(
      { error: { code: "room_not_set", message: "The organizer hasn't set the room yet." } },
      { status: 404 }
    );
  }
  if (result.error === "not_yet_revealed") {
    return NextResponse.json(
      {
        error: {
          code: "not_yet_revealed",
          message: "Room details aren't revealed yet.",
          revealAt: result.revealAt,
        },
      },
      { status: 403 }
    );
  }

  return NextResponse.json(result.data);
}
