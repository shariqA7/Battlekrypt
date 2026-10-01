// PATCH /api/admin/featured/slides/:id, DELETE /api/admin/featured/slides/:id
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { deleteSlide, updateSlide } from "@/lib/services/featured";
import { featuredError } from "@/lib/featured-helpers";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await updateSlide(id, auth.admin.id, body);
  if ("error" in result) return featuredError(result);
  return NextResponse.json(result.data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const result = await deleteSlide(id, auth.admin.id);
  if ("error" in result) return featuredError(result);
  return NextResponse.json(result.data);
}
