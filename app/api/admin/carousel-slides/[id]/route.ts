// DELETE /api/admin/carousel-slides/:id — admin removes a slide
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { deleteCarouselSlide } from "@/lib/services/tournaments";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  await deleteCarouselSlide(id);
  return NextResponse.json({ deleted: true });
}
