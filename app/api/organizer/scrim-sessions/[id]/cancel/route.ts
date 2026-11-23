// POST /api/organizer/scrim-sessions/:id/cancel — the organizer can't run this session of a recurring series.
// body: { reason? }. Players who paid choose between the next session and a refund (see series-booking.ts).
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { cancelSeriesSession } from "@/lib/services/series-booking";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const r = await cancelSeriesSession(auth.organizerProfile.userId, id, b.reason);
  if ("error" in r) {
    const status = r.error === "forbidden" ? 403 : r.error === "pending_payments" || r.error === "invalid_status" ? 409 : 400;
    return NextResponse.json({ error: { code: r.error, message: r.message ?? "Could not cancel this session." } }, { status });
  }
  return NextResponse.json(r.data);
}
