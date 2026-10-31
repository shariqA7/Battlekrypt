import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { confirmRefundReceived, contestRefund, markRefundSent } from "@/lib/services/payment-disputes";
import { disputeError } from "@/lib/dispute-http";

// POST { action: "sent" | "received" | "contest" }
//   sent     the organizer says the refund was paid
//   received the payer confirms it arrived
//   contest  the payer says it did not arrive
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const input = { userId: auth.user.id, disputeId: id };
  const result =
    body.action === "sent" ? await markRefundSent(input)
    : body.action === "received" ? await confirmRefundReceived(input)
    : body.action === "contest" ? await contestRefund(input)
    : null;
  if (!result) return NextResponse.json({ error: { code: "validation_error", message: "Unknown action." } }, { status: 400 });
  return "error" in result ? disputeError(result) : NextResponse.json({ ok: true });
}
