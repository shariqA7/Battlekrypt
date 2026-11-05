// PATCH /api/admin/giveaways/settings — { verifiedOnly?, reviewAboveUsd?, claimDays? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { updateGiveawaySettings } from "@/lib/services/giveaways";
import { giveawayError } from "@/lib/giveaway-http";

export async function PATCH(request: Request) {
  const auth = await requireAdmin("giveaways");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const result = await updateGiveawaySettings({ adminId: auth.admin.id, verifiedOnly: b.verifiedOnly, reviewAboveUsd: b.reviewAboveUsd, claimDays: b.claimDays });
  if ("error" in result) return giveawayError(result);
  return NextResponse.json(result.data);
}
