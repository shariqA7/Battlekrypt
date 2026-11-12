// POST /api/ads/:id/view — a banner scrolled into view. Counts one impression for today.
// Public, anonymous, rate limited per IP so a script can't inflate an advertiser's numbers cheaply.
import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordView } from "@/lib/services/ads";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rl = await rateLimit(`ad-view:${clientIp(request.headers)}`, 120, 10 * 60 * 1000);
  if (rl.allowed) await recordView(id).catch(() => undefined);
  return new NextResponse(null, { status: 204 });
}
