// Scheduled privacy housekeeping for visit logs (daily; see vercel.json).
// Erases the IP address, city, browser string and account link from visits older
// than VISIT_DETAIL_RETENTION_DAYS. The anonymous row stays for statistics.
//
// Call with:  Authorization: Bearer $CRON_SECRET   (Vercel Cron sends it itself)
import { NextResponse } from "next/server";
import { anonymizeOldVisits } from "@/lib/services/analytics";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized." } }, { status: 401 });
  }
  const anonymized = await anonymizeOldVisits();
  return NextResponse.json({ ok: true, anonymized });
}
