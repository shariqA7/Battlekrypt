// POST /api/admin/tax-payments/:id/void — { note } a tax payment is voided, never deleted
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { voidTaxPayment } from "@/lib/services/ledger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("ledger");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const r = await voidTaxPayment(auth.admin.id, id, b?.note);
  if ("error" in r) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
