import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { unreadCount } from "@/lib/services/notifications";

// Cheap count for the bell badge (polled while the tab is open).
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  return NextResponse.json({ unread: await unreadCount(auth.user.id) }, { headers: { "Cache-Control": "no-store" } });
}
