// POST /api/challenge-entries/:entryId/:action — every step after a challenger
// is picked. The entry ID is the picked application's ID.
//
//   proof               challenger  { matchId, proofUrls[], note? }
//   review-proof        poster      { action: "confirm" | "dispute", reason?, evidenceUrls? }
//   payout-details      challenger  { details }
//   mark-paid           poster      { receiptUrls[], note? }
//   confirm-received    challenger  {}
//   report-not-paid     challenger  { reason, evidenceUrls? }
//   respond             the accused { note, evidenceUrls? }
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import {
  confirmReceived, markPaid, reportNotPaid, respondToDispute,
  reviewProof, submitPayoutDetails, submitProof,
} from "@/lib/services/challenge-fulfillment";

const STATUS: Record<string, number> = {
  not_found: 404,
  forbidden: 403,
  validation_error: 400,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const { id, action } = await params;
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const uid = auth.user.id;

  let result: { data: { id: string } } | { error: string; message: string };
  switch (action) {
    case "proof": result = await submitProof(uid, id, body); break;
    case "review-proof": result = await reviewProof(uid, id, body); break;
    case "payout-details": result = await submitPayoutDetails(uid, id, body.details); break;
    case "mark-paid": result = await markPaid(uid, id, body); break;
    case "confirm-received": result = await confirmReceived(uid, id); break;
    case "report-not-paid": result = await reportNotPaid(uid, id, body); break;
    case "respond": result = await respondToDispute(uid, id, body); break;
    default:
      return NextResponse.json({ error: { code: "not_found", message: "Unknown action." } }, { status: 404 });
  }

  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: STATUS[result.error] ?? 409 }
    );
  }
  return NextResponse.json(result.data);
}
