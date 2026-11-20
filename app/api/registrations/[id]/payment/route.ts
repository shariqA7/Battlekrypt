// POST /api/registrations/:id/payment — a team promoted off the waiting list (paid events) sends its payment.
// Body: { paymentProofUrl, paymentReference }
import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/auth-helpers";
import { SEAT_PAYMENT_MESSAGES, submitSeatPayment } from "@/lib/services/seat-payments";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireSignedIn();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await submitSeatPayment(id, auth.user.id, {
    paymentProofUrl: typeof body.paymentProofUrl === "string" ? body.paymentProofUrl : undefined,
    paymentReference: typeof body.paymentReference === "string" ? body.paymentReference : undefined,
  });
  if ("error" in result) {
    const [status, message] = SEAT_PAYMENT_MESSAGES[result.error];
    return NextResponse.json({ error: { code: result.error, message } }, { status });
  }
  return NextResponse.json({ ok: true });
}
