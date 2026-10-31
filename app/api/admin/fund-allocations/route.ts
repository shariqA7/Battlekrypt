// POST /api/admin/fund-allocations — record how the community fund is used
// body: { amount, currency, purpose, campaignId?, tournamentId? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { allocateFund } from "@/lib/services/donations";
import { donationError } from "@/lib/donation-http";

export async function POST(request: Request) {
  const auth = await requireAdmin("donations");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const result = await allocateFund({ adminId: auth.admin.id, amount: b.amount, currency: b.currency, purpose: b.purpose, campaignId: b.campaignId, tournamentId: b.tournamentId });
  if ("error" in result) return donationError(result);
  return NextResponse.json(result.data, { status: 201 });
}
