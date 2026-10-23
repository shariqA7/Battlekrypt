// PUT /api/admin/organizer-trust — update the starter limits and grace period
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { updateTrustConfig } from "@/lib/services/organizer-trust";

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const result = await updateTrustConfig({
    starterMaxEntryFeeUsd: Number(b.starterMaxEntryFeeUsd),
    starterMaxPrizeUsd: Number(b.starterMaxPrizeUsd),
    starterMaxPaidEntrants: Number(b.starterMaxPaidEntrants),
    graduationEvents: Number(b.graduationEvents),
    payoutGraceDays: Number(b.payoutGraceDays),
  });
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error, message: result.message } }, { status: 400 });
  }
  return NextResponse.json(result.data);
}
