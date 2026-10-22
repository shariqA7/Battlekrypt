// POST /api/admin/consent-cases/[id] — { action: "allow" | "remove", note? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { decideConsentCase } from "@/lib/services/consent-cases";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (body.action !== "allow" && body.action !== "remove") {
    return NextResponse.json({ error: { code: "validation_error", message: "action must be allow or remove." } }, { status: 400 });
  }
  const result = await decideConsentCase(id, auth.admin.id, body.action, typeof body.note === "string" ? body.note : undefined);
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error, message: result.message } }, { status: result.error === "not_found" ? 404 : 409 });
  }
  return NextResponse.json(result.data);
}
