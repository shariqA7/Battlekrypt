// Creates renewal invoices for organizations whose paid plan is about to end (run daily; see
// vercel.json). Safe to run more than once a day: an invoice is never created twice for the same
// plan end date.
//
// Call with:  Authorization: Bearer $CRON_SECRET   (Vercel Cron sends it itself)
import { NextResponse } from "next/server";
import { createDueRenewalInvoices } from "@/lib/services/renewals";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized." } }, { status: 401 });
  }
  const run = await createDueRenewalInvoices();
  return NextResponse.json({ ok: true, created: run.created.length, failed: run.failed.length, disabled: run.disabled });
}
