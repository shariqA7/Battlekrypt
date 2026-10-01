// POST /api/admin/featured/slides — add a carousel slide.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { createSlide } from "@/lib/services/featured";
import { featuredError } from "@/lib/featured-helpers";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await createSlide(auth.admin.id, body);
  if ("error" in result) return featuredError(result);
  return NextResponse.json(result.data, { status: 201 });
}
