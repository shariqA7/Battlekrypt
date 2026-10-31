// POST /api/admin/tax-payments — { date: "YYYY-MM-DD", type: "collected_tax" | "income_tax", amount, currency,
//                                  authority?, reference?, periodNote?, note?, receiptUrl? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { createTaxPayment } from "@/lib/services/ledger";

export async function POST(request: Request) {
  const auth = await requireAdmin("ledger");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const r = await createTaxPayment(auth.admin.id, b && typeof b === "object" ? b : {});
  if ("error" in r) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: 400 });
  return NextResponse.json({ id: r.data.id }, { status: 201 });
}
