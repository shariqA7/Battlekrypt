// PATCH /api/admin/donation-settings — { verifiedOnly?: boolean, instructions?: string | null }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { updateDonationSettings } from "@/lib/services/donations";
import { donationError } from "@/lib/donation-http";

export async function PATCH(request: Request) {
  const auth = await requireAdmin("donations");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const result = await updateDonationSettings({ verifiedOnly: b.verifiedOnly, instructions: b.instructions });
  if ("error" in result) return donationError(result);
  return NextResponse.json(result.data);
}
