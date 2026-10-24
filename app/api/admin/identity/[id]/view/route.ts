// POST /api/admin/identity/:id/view  Body: { kind: "front"|"back"|"selfie" }
// Admin asks to open one identity image. Logs the request, then returns the
// storage path; the browser signs it with the admin's own login (5 minutes).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { requestIdentityFileView } from "@/lib/services/identity";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const b = await request.json().catch(() => ({}));
  const kind = b.kind === "front" || b.kind === "back" || b.kind === "selfie" ? b.kind : null;
  if (!kind) return NextResponse.json({ error: { code: "invalid", message: "Unknown file." } }, { status: 400 });

  const result = await requestIdentityFileView(id, kind, auth.admin.id);
  if ("error" in result) {
    const message = result.error === "no_file" ? "That file has been deleted or was never uploaded." : "Not found.";
    return NextResponse.json({ error: { code: result.error, message } }, { status: 404 });
  }
  return NextResponse.json(result.data);
}
