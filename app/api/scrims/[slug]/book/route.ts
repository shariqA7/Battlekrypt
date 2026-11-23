// POST /api/scrims/:slug/book — book several sessions of a scrim series with ONE payment.
// body: { sessionIds: string[], teamId?, memberPlayerIds?, paymentProofUrl?, paymentReference? }
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { banGuard } from "@/lib/services/bans";
import { rateLimit } from "@/lib/rate-limit";
import { createBooking } from "@/lib/services/series-booking";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in first." } }, { status: 401 });
  const ban = await banGuard(user.id);
  if (ban) return ban;
  const rl = await rateLimit(`book:${user.id}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: { code: "rate_limited", message: "Too many attempts. Please try again later." } }, { status: 429 });
  const b = await request.json().catch(() => ({}));
  const r = await createBooking(user.id, slug, b);
  if ("error" in r) {
    const status = r.error === "not_found" ? 404 : r.error === "not_authorized" ? 403 : 400;
    return NextResponse.json({ error: { code: r.error, message: r.message ?? "Could not book." } }, { status });
  }
  return NextResponse.json(r.data, { status: 201 });
}
