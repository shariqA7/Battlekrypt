// POST /api/tournaments/:id/click — public, no auth. Basic shareable-link
// click tracking (spec §3). Called once from a client component on real
// mount so Link prefetches (which never run page JS) don't count.
import { NextResponse } from "next/server";
import { incrementTournamentClick } from "@/lib/services/tournaments";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await incrementTournamentClick(id);
  return NextResponse.json({ ok: true });
}
