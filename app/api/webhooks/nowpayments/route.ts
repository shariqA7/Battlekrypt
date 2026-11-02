// POST /api/webhooks/nowpayments — NOWPayments' payment notifications (IPN).
// Public, but every request must carry a valid x-nowpayments-sig (HMAC-SHA512 with NOWPAYMENTS_IPN_SECRET).
// Set this URL as the IPN callback in your NOWPayments account too (it is also sent with each checkout).
import { NextResponse } from "next/server";
import { handleNotification } from "@/lib/services/nowpayments";

export async function POST(request: Request) {
  const raw = await request.text();
  const r = await handleNotification(raw, request.headers.get("x-nowpayments-sig"));
  return NextResponse.json(r.body, { status: r.status });
}
