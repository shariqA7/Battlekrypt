// POST /api/tournaments/:id/confirm-refunds — organizer says they refunded
// every paid player of an admin-approved cancellation
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { confirmRefunds } from "@/lib/services/change-requests";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const result = await confirmRefunds(auth.organizerProfile.id, id);
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: { code: result.error, message: "Nothing to confirm for this event." } }, { status });
  }
  return NextResponse.json({ ok: true });
}
