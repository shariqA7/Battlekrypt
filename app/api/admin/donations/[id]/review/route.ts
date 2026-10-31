// POST /api/admin/donations/:id/review — { approve: boolean, note? } (a note is needed to reject)
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { reviewDonation } from "@/lib/services/donations";
import { donationError } from "@/lib/donation-http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("donations");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const result = await reviewDonation({ adminId: auth.admin.id, donationId: id, approve: b.approve === true, note: typeof b.note === "string" ? b.note : undefined });
  if ("error" in result) return donationError(result);
  return NextResponse.json(result.data);
}
