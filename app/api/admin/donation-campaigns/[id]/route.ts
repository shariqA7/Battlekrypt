// PATCH /api/admin/donation-campaigns/:id — { status?, verifiedOnly?, title?, description?, endsAt? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { updateCampaign } from "@/lib/services/donations";
import { donationError } from "@/lib/donation-http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("donations");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const result = await updateCampaign({ adminId: auth.admin.id, id, status: b.status, verifiedOnly: b.verifiedOnly, title: b.title, description: b.description, endsAt: b.endsAt });
  if ("error" in result) return donationError(result);
  return NextResponse.json(result.data);
}
