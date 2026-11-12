// GET /api/ads/:id/click — the banner link. Counts a click, then sends the person to the
// advertiser's page. The destination is the https link an admin saved on the campaign, never
// something taken from the request, so this can't be used as an open redirect.
import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordClick } from "@/lib/services/ads";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rl = await rateLimit(`ad-click:${clientIp(request.headers)}`, 60, 10 * 60 * 1000);
  const url = await recordClick(id, new Date(), rl.allowed).catch(() => null);
  return NextResponse.redirect(url ?? new URL("/", request.url), 302);
}
