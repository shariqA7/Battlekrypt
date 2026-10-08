// POST { action: "dismiss" | "fail_entry", note }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { resolveFlag } from "@/lib/services/challenge-integrity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (body.action !== "dismiss" && body.action !== "fail_entry") {
    return NextResponse.json({ error: { code: "validation_error", message: "Choose dismiss or end the entry." } }, { status: 400 });
  }
  const result = await resolveFlag(auth.admin.id, id, { action: body.action, note: typeof body.note === "string" ? body.note : "" });
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "validation_error" ? 400 : 409;
    return NextResponse.json({ error: { code: result.error, message: result.message } }, { status });
  }
  return NextResponse.json(result.data);
}
