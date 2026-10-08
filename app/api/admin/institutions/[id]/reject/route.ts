import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { setInstitutionVerified } from "@/lib/services/institutions";

// POST /api/admin/institutions/:id/reject — remove an institute's verification.
// Body: { note: string } — logged in the admin audit trail.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await setInstitutionVerified(
    id,
    auth.admin.id,
    false,
    typeof body.note === "string" ? body.note : undefined
  );
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "note_required" ? 400 : 409;
    const message =
      result.error === "note_required" ? "Add a note explaining why." : "Couldn't update this institute.";
    return NextResponse.json({ error: { code: result.error, message } }, { status });
  }
  return NextResponse.json(result.data);
}
