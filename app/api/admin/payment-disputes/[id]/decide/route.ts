import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { decideDispute } from "@/lib/services/payment-disputes";
import { disputeError } from "@/lib/dispute-http";

// POST { outcome: "for_payer" | "for_organizer", note, refundAmount? }
// For the payer, a refund is ordered (the full fee unless refundAmount is given).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("approvals");
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await decideDispute({ adminId: auth.admin.id, disputeId: id, outcome: String(body.outcome ?? ""), note: body.note, refundAmount: body.refundAmount });
  return "error" in result ? disputeError(result) : NextResponse.json({ ok: true });
}
