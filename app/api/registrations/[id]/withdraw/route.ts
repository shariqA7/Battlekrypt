// POST /api/registrations/:id/withdraw — a team or player pulls out. Body: { reason?: string }
// Frees the seat (the next team in line gets it) and applies the organizer's refund policy.
import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/auth-helpers";
import { WITHDRAW_MESSAGES, withdrawEntry } from "@/lib/services/withdrawals";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireSignedIn();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await withdrawEntry(id, auth.user.id, typeof body.reason === "string" ? body.reason : undefined);
  if ("error" in result) {
    const [status, message] = WITHDRAW_MESSAGES[result.error];
    return NextResponse.json({ error: { code: result.error, message } }, { status });
  }
  return NextResponse.json(result);
}
