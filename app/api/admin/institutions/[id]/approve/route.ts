import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { setInstitutionVerified } from "@/lib/services/institutions";

// POST /api/admin/institutions/:id/approve — verify an institute.
// Body: { note?: string }
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
    true,
    typeof body.note === "string" ? body.note : undefined
  );
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json(
      { error: { code: result.error, message: "Couldn't verify this institute." } },
      { status }
    );
  }
  return NextResponse.json(result.data);
}
