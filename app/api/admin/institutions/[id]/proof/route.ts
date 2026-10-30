// POST /api/admin/institutions/:id/proof
// Admin asks to open an institute's registration document. Logs the request, then returns the
// storage path; the browser signs it with the admin's own login (5 minutes).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { requestInstituteProofView } from "@/lib/services/institutions";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("institutions");
  if ("response" in auth) return auth.response;
  const result = await requestInstituteProofView(id, auth.admin.id);
  if ("error" in result) {
    const message = result.error === "no_file" ? "No document was uploaded." : "Not found.";
    return NextResponse.json({ error: { code: result.error, message } }, { status: 404 });
  }
  return NextResponse.json(result.data);
}
