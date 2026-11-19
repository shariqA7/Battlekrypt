import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { listNotificationsPage, unreadCount } from "@/lib/services/notifications";

// GET /api/notifications?filter=all|unread&cursor=<id>&limit=15
export async function GET(req: Request) {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") === "unread" ? "unread" : "all";
  const cursor = url.searchParams.get("cursor");
  const limit = Number(url.searchParams.get("limit")) || 15;

  const [page, unread] = await Promise.all([
    listNotificationsPage(auth.user.id, { filter, cursor, limit }),
    unreadCount(auth.user.id),
  ]);
  return NextResponse.json({ ...page, unread }, { headers: { "Cache-Control": "no-store" } });
}
