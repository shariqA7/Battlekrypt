// GET  /api/admin/payment-methods — every payment method (active or not)
// POST /api/admin/payment-methods — add one. body: { type, name, currencies?, instructions?, ...fields for that type }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { createPaymentMethod, listPaymentMethods } from "@/lib/services/payment-methods";
import { methodError } from "@/lib/invoice-helpers";

export async function GET() {
  const auth = await requireAdmin("payments", "view");
  if ("response" in auth) return auth.response;
  return NextResponse.json({ items: await listPaymentMethods() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin("payments");
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await createPaymentMethod(auth.admin.id, body && typeof body === "object" ? body : {});
  if ("error" in result) return methodError(result);
  return NextResponse.json(result.data, { status: 201 });
}
