import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { rejectApplication } from "@/lib/services/org-applications";

// Body: { note?: string, fields?: { orgName?: "…", handlerPhone?: "…" } }
// At least one of them is required — the applicant needs to know what to fix.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await rejectApplication(id, auth.admin.id, {
    note: typeof body.note === "string" ? body.note : undefined,
    fields: body.fields && typeof body.fields === "object" ? body.fields : undefined,
  });
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "feedback_required" ? 400 : 409;
    const message =
      result.error === "feedback_required"
        ? "Tell the applicant what to fix (a note or a field comment)."
        : "Couldn't reject this application.";
    return NextResponse.json({ error: { code: result.error, message } }, { status });
  }
  return NextResponse.json(result.data);
}
