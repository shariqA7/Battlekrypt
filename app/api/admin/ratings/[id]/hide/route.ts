// POST /api/admin/ratings/:id/hide — { hidden: boolean, reason? }
// Hides a rating from the organizer's average (abuse, wrong event), or brings it back.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { setRatingHidden } from "@/lib/services/organizer-ratings";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("organizations");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const result = await setRatingHidden({ adminId: auth.admin.id, ratingId: id, hidden: b.hidden !== false, reason: typeof b.reason === "string" ? b.reason : undefined });
  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.error, message: "message" in result ? result.message : "Rating not found." } },
      { status: result.error === "not_found" ? 404 : 400 }
    );
  }
  return NextResponse.json(result.data);
}
