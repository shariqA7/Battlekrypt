import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { markRead } from "@/lib/services/notifications";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  await markRead(auth.user.id, id);
  return new NextResponse(null, { status: 204 });
}
