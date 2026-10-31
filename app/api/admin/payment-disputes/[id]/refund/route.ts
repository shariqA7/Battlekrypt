import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { adminRefundAction } from "@/lib/services/payment-disputes";
import { disputeError } from "@/lib/dispute-http";

// POST { action: "mark_received" | "give_more_time", days? } on an ordered refund
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("approvals");
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await adminRefundAction({ adminId: auth.admin.id, disputeId: id, action: String(body.action ?? ""), days: body.days });
  return "error" in result ? disputeError(result) : NextResponse.json({ ok: true });
}
