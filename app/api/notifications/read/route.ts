import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { markAllRead } from "@/lib/services/notifications";

export async function POST() {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  await markAllRead(auth.user.id);
  return new NextResponse(null, { status: 204 });
}
