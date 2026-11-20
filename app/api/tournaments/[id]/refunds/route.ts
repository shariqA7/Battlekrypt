// GET /api/tournaments/:id/refunds — the organizer's list of withdrawn teams and where each refund stands.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { listRefunds } from "@/lib/services/withdrawals";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const result = await listRefunds(id, auth.organizerProfile.id);
  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.error === "not_found" ? "Tournament not found." : "Only the organizer can see refunds." } },
      { status: result.error === "not_found" ? 404 : 403 },
    );
  }
  return NextResponse.json(result);
}
