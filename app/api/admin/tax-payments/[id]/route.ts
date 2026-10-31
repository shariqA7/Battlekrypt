// PATCH /api/admin/tax-payments/:id — edit a tax payment (same body as create)
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { updateTaxPayment } from "@/lib/services/ledger";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("ledger");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const r = await updateTaxPayment(auth.admin.id, id, b && typeof b === "object" ? b : {});
  if ("error" in r) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ id });
}
