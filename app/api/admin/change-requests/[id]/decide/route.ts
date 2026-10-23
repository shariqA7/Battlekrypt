// POST /api/admin/change-requests/:id/decide — { approve: boolean, note }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { decideChangeRequest } from "@/lib/services/change-requests";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  if (typeof b.approve !== "boolean") {
    return NextResponse.json({ error: { code: "validation_error", message: "approve must be true or false." } }, { status: 400 });
  }
  const result = await decideChangeRequest({ adminId: auth.admin.id, requestId: id, approve: b.approve, note: String(b.note ?? "") });
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: { code: result.error, message: "message" in result && result.message ? result.message : "Not found." } }, { status });
  }
  return NextResponse.json(result.data);
}
