// PATCH  /api/admin/payment-methods/:id — edit, switch on/off ({ isActive }) or reorder ({ sortOrder })
// DELETE /api/admin/payment-methods/:id — only if no invoice has used it
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { deletePaymentMethod, updatePaymentMethod } from "@/lib/services/payment-methods";
import { methodError } from "@/lib/invoice-helpers";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await updatePaymentMethod(auth.admin.id, id, body && typeof body === "object" ? body : {});
  if ("error" in result) return methodError(result);
  return NextResponse.json(result.data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const result = await deletePaymentMethod(auth.admin.id, id);
  if ("error" in result) return methodError(result);
  return NextResponse.json(result.data);
}
