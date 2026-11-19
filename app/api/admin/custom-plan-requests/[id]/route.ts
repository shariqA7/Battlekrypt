// PATCH /api/admin/custom-plan-requests/:id
//   { action: "quote", priceAmount, priceCurrency, durationDays?, limits?, planName?, depositAmount?, adminNote? }
//   { action: "close", adminNote? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { closeCustomRequest, quoteCustomRequest } from "@/lib/services/custom-plans";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("plans");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const r = b.action === "quote" ? await quoteCustomRequest(auth.admin.id, id, b)
    : b.action === "close" ? await closeCustomRequest(auth.admin.id, id, b.adminNote)
    : { error: "validation_error" as const, message: "Choose quote or close." };
  if ("error" in r) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: r.error === "not_found" ? 404 : r.error === "invalid_status" ? 409 : 400 });
  return NextResponse.json(r.data);
}
