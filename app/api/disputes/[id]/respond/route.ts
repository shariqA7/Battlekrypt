import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { respondToDispute } from "@/lib/services/payment-disputes";
import { disputeError } from "@/lib/dispute-http";

// POST { note, evidenceUrls? } -> the other side's response
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await respondToDispute({ userId: auth.user.id, disputeId: id, note: body.note, evidenceUrls: body.evidenceUrls });
  return "error" in result ? disputeError(result) : NextResponse.json({ ok: true });
}
