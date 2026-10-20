// GET /api/games — public list of approved games, optional ?search=
import { gameVisibilityWhere } from "@/lib/game-region";
import { getViewerRegion } from "@/lib/services/viewer-region";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  // Only games that are available where this person is (admins see all).
  const region = await getViewerRegion();
  const games = await prisma.game.findMany({
    where: {
      isApproved: true,
      ...(region.showAll ? {} : gameVisibilityWhere(region.country)),
      ...(search && { name: { contains: search, mode: "insensitive" } }),
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: games });
}
