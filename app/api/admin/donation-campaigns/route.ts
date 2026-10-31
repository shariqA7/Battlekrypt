// POST /api/admin/donation-campaigns — open a donation campaign
// body: { title, description, currency, goalAmount?, endsAt?, verifiedOnly?, status? ("active" | "draft") }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { createCampaign } from "@/lib/services/donations";
import { donationError } from "@/lib/donation-http";

export async function POST(request: Request) {
  const auth = await requireAdmin("donations");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const result = await createCampaign({ adminId: auth.admin.id, title: b.title, description: b.description, currency: b.currency, goalAmount: b.goalAmount, endsAt: b.endsAt, verifiedOnly: b.verifiedOnly, status: b.status });
  if ("error" in result) return donationError(result);
  return NextResponse.json(result.data, { status: 201 });
}
