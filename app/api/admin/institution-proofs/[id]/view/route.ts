// POST /api/admin/institution-proofs/:registrationId/view
// Admin asks to open a student-ID photo. Logs the request, then returns the
// storage path; the browser signs it with the admin's own login.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { requestProofView } from "@/lib/services/institution-proofs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("institutions");
  if ("response" in auth) return auth.response;

  const result = await requestProofView(id, auth.admin.id);
  if ("error" in result) {
    const message = result.error === "no_proof" ? "This entry has no ID photo." : "Entry not found.";
    return NextResponse.json({ error: { code: result.error, message } }, { status: 404 });
  }
  return NextResponse.json(result.data);
}
