// PATCH  /api/admin/feedback/:id — { status?, adminNote? }
// DELETE /api/admin/feedback/:id — remove a message (spam, or a sender's request to be forgotten)
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { deleteFeedback, updateFeedback } from "@/lib/services/feedback";

const fail = (error: string, message?: string) =>
  NextResponse.json({ error: { code: error, message: message ?? "Feedback not found." } }, { status: error === "not_found" ? 404 : 400 });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("feedback");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const r = await updateFeedback({ adminId: auth.admin.id, id, status: b.status, adminNote: b.adminNote });
  if (r.error) return fail(r.error, r.message);
  return NextResponse.json({ id: r.data!.id, status: r.data!.status });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("feedback");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const r = await deleteFeedback(id);
  if (r.error) return fail(r.error);
  return NextResponse.json(r.data);
}
