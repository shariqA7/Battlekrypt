// GET /api/games — public list of approved games, optional ?search=
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  const games = await prisma.game.findMany({
    where: {
      isApproved: true,
      ...(search && { name: { contains: search, mode: "insensitive" } }),
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: games });
}
