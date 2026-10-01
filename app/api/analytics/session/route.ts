// POST /api/analytics/session — called once per page load by SessionBeacon.
// Always answers 204 so analytics can never break the site.
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getClientGeo } from "@/lib/geo";
import { parseUserAgent } from "@/lib/user-agent";
import { recordVisit } from "@/lib/services/analytics";

export async function POST(request: Request) {
  try {
    const h = await headers();
    const userAgent = h.get("user-agent");
    const ua = parseUserAgent(userAgent);
    if (!ua) return new Response(null, { status: 204 }); // crawler

    const body = await request.json().catch(() => ({}));
    const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path : "/";
    const referrer = typeof body.referrer === "string" && body.referrer ? body.referrer : null;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // The FK on userId needs the User row to exist (it doesn't until first
    // sign-in finishes), so only attach it when it does.
    let userId: string | null = null;
    if (user) {
      const exists = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
      userId = exists ? user.id : null;
    }

    await recordVisit({ userId, geo: getClientGeo(h), ua, userAgent, path, referrer });
  } catch (e) {
    console.error("session beacon failed", e);
  }
  return new Response(null, { status: 204 });
}
