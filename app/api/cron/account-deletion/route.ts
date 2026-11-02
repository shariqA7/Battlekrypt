// Daily job (see vercel.json): erases every account whose 14-day cooling-off has ended. An account
// with something open again (a dispute, a live event, ...) is NOT erased: its request is cancelled
// and the person is told why.
//
// Call with:  Authorization: Bearer $CRON_SECRET   (Vercel Cron sends it itself)
import { NextResponse } from "next/server";
import { processDueDeletions, storageDeps } from "@/lib/services/account-deletion";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized." } }, { status: 401 });
  }
  const result = await processDueDeletions(new Date(), storageDeps(), new URL(request.url).origin);
  return NextResponse.json({ ok: true, ...result });
}
