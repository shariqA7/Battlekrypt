// POST /api/tournaments/:id/stages — organizer adds a stage
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Tournament not found." } },
      { status: 404 }
    );
  }
  if (tournament.organizerId !== auth.organizerProfile.id) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "You don't own this tournament." } },
      { status: 403 }
    );
  }

  const body = await request.json();
  if (!body.name) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "name is required." } },
      { status: 400 }
    );
  }

  const stageCount = await prisma.stage.count({ where: { tournamentId: id } });

  const stage = await prisma.stage.create({
    data: {
      tournamentId: id,
      name: body.name,
      order: stageCount,
      startAt: body.startAt ? new Date(body.startAt) : undefined,
    },
  });

  return NextResponse.json(stage, { status: 201 });
}
