// POST /api/admin/identity/:id/reveal
// Shows the kept name, document number and address of a checked organizer (for
// example to report a scam to the authorities). Every reveal is logged.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { revealIdentityDetails } from "@/lib/services/identity";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const result = await revealIdentityDetails(id, auth.admin.id);
  if ("error" in result) {
    const message = result.error === "unavailable" ? "No details are kept for this check." : "Not found.";
    return NextResponse.json({ error: { code: result.error, message } }, { status: 404 });
  }
  return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
}
