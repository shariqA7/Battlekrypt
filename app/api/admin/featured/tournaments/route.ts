// POST   /api/admin/featured/tournaments { tournamentId } — feature one
// DELETE /api/admin/featured/tournaments?tournamentId=… — un-feature one
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { addFeaturedTournament, removeFeaturedTournament } from "@/lib/services/featured";
import { featuredError } from "@/lib/featured-helpers";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await addFeaturedTournament(auth.admin.id, body.tournamentId);
  if ("error" in result) return featuredError(result);
  return NextResponse.json(result.data, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const tournamentId = new URL(request.url).searchParams.get("tournamentId") ?? "";
  const result = await removeFeaturedTournament(auth.admin.id, tournamentId);
  if ("error" in result) return featuredError(result);
  return NextResponse.json(result.data);
}
