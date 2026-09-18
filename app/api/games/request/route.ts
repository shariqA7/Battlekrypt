// POST /api/games/request — organizer requests a game not yet on the platform
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
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

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!organizerProfile) {
    return NextResponse.json(
      { error: { code: "not_organizer", message: "Organizer profile required." } },
      { status: 403 }
    );
  }

  const body = await request.json();
  if (!body.gameName) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "gameName is required." } },
      { status: 400 }
    );
  }

  const gameRequest = await prisma.gameRequest.create({
    data: {
      organizerId: organizerProfile.id,
      gameName: body.gameName,
    },
  });

  return NextResponse.json(gameRequest, { status: 201 });
}
