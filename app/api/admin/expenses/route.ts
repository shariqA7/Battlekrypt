// POST /api/admin/expenses — { date: "YYYY-MM-DD", category, title, vendor?, amount, currency, note?, receiptUrl? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { createExpense } from "@/lib/services/ledger";

export async function POST(request: Request) {
  const auth = await requireAdmin("ledger");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const r = await createExpense(auth.admin.id, b && typeof b === "object" ? b : {});
  if ("error" in r) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: 400 });
  return NextResponse.json({ id: r.data.id }, { status: 201 });
}
