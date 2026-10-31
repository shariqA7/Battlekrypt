// Daily check on payment disputes (see vercel.json): cases nobody answered go to an admin, and
// organizers who ignored a refund an admin ordered are paused.
//
// Call with:  Authorization: Bearer $CRON_SECRET   (Vercel Cron sends it itself)
import { NextResponse } from "next/server";
import { sweepDisputes } from "@/lib/services/payment-disputes";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized." } }, { status: 401 });
  }
  await sweepDisputes();
  return NextResponse.json({ ok: true });
}
