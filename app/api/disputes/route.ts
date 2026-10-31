import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { listMyDisputes, openDispute } from "@/lib/services/payment-disputes";
import { disputeError } from "@/lib/dispute-http";

// GET -> my payment disputes (as a payer or as an organizer)
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  return NextResponse.json({ disputes: await listMyDisputes(auth.user.id) });
}

// POST { registrationId, kind, reason, evidenceUrls? } -> opens a case
export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await openDispute({
    userId: auth.user.id,
    registrationId: typeof body.registrationId === "string" ? body.registrationId : "",
    kind: String(body.kind ?? ""),
    reason: body.reason,
    evidenceUrls: body.evidenceUrls,
  });
  if ("error" in result) return disputeError(result);
  return NextResponse.json({ id: result.data.id }, { status: 201 });
}
