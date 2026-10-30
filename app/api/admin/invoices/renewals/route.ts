// POST /api/admin/invoices/renewals — run the renewal check now (the same one the daily job runs).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { createDueRenewalInvoices } from "@/lib/services/renewals";

export async function POST() {
  const auth = await requireAdmin("payments");
  if ("response" in auth) return auth.response;
  return NextResponse.json(await createDueRenewalInvoices());
}
