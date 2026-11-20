// PATCH /api/registrations/:id/refund — the organizer acts on a withdrawn team's refund.
// Body: { action: "owe" | "decline" | "refunded" }
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { actOnRefund } from "@/lib/services/withdrawals";

const MESSAGES: Record<string, [number, string]> = {
  not_found: [404, "Entry not found."],
  forbidden: [403, "Only the organizer of this tournament can do that."],
  not_allowed: [409, "That can't be done to this refund right now."],
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  if (!["owe", "decline", "refunded"].includes(body.action)) {
    return NextResponse.json({ error: { code: "invalid_action", message: "Choose owe, decline or refunded." } }, { status: 400 });
  }
  const result = await actOnRefund(id, auth.organizerProfile.id, body.action);
  if ("error" in result) {
    const [status, message] = MESSAGES[result.error];
    return NextResponse.json({ error: { code: result.error, message } }, { status });
  }
  return NextResponse.json(result);
}
