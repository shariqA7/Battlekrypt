// POST /api/giveaways/:id/enter — enter a giveaway (one entry per account).
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { enterGiveaway } from "@/lib/services/giveaways";
import { giveawayError } from "@/lib/giveaway-http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const result = await enterGiveaway(auth.user.id, id);
  if ("error" in result) return giveawayError(result);
  return NextResponse.json(result.data, { status: 201 });
}
