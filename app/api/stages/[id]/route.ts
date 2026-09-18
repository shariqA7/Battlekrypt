// PATCH /api/stages/:id — organizer sets room ID/password/reveal time
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const stage = await prisma.stage.findUnique({
    where: { id },
    include: { tournament: true },
  });
  if (!stage) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Stage not found." } },
      { status: 404 }
    );
  }
  if (stage.tournament.organizerId !== auth.organizerProfile.id) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "You don't own this tournament." } },
      { status: 403 }
    );
  }

  const body = await request.json();

  const updated = await prisma.stage.update({
    where: { id },
    data: {
      roomId: body.roomId,
      roomPassword: body.roomPassword,
      roomRevealAt: body.roomRevealAt ? new Date(body.roomRevealAt) : undefined,
      status: body.status,
    },
  });

  return NextResponse.json(updated);
}
