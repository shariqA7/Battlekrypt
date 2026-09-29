// PATCH /api/admin/suggested-rules/:id — change any of its fields (partial)
// DELETE /api/admin/suggested-rules/:id — remove it (tournaments keep their copies)
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { ruleError } from "@/lib/rule-helpers";
import { updateSuggestedRule, deleteSuggestedRule } from "@/lib/services/rules";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await updateSuggestedRule(id, body ?? {});
  if ("error" in result) return ruleError(result);
  return NextResponse.json(result.data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const result = await deleteSuggestedRule(id);
  if ("error" in result) return ruleError(result);
  return NextResponse.json(result.data);
}
