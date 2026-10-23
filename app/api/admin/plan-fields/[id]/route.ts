// DELETE /api/admin/plan-fields/:id — remove a field and its value on every plan
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { deletePlanField } from "@/lib/services/plan-fields";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const result = await deletePlanField(id);
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error, message: "Field not found." } }, { status: 404 });
  }
  return NextResponse.json(result.data);
}
