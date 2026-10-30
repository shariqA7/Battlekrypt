// POST /api/admin/organizers/:id/limits — body { lifted: boolean }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { setLimitsLifted } from "@/lib/services/organizer-trust";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("organizations");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  if (typeof b.lifted !== "boolean") {
    return NextResponse.json({ error: { code: "validation_error", message: "lifted must be true or false." } }, { status: 400 });
  }
  const result = await setLimitsLifted(auth.admin.id, id, b.lifted);
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error, message: "Organizer not found." } }, { status: 404 });
  }
  return NextResponse.json(result.data);
}
