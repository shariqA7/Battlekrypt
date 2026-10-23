// POST /api/admin/payouts/:id/settle — admin decides a disputed payout is settled
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { settlePayout } from "@/lib/services/organizer-trust";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const result = await settlePayout(auth.admin.id, id, String(b.note ?? ""));
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: { code: result.error, message: "message" in result ? result.message : "Not found." } }, { status });
  }
  return NextResponse.json(result.data);
}
