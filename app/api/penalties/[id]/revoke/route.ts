// POST /api/penalties/:id/revoke — take a penalty back. The host may revoke any;
// a co-host institute only the ones it issued itself. A revoked disqualification
// puts the entry back in the tournament.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { revokePenalty } from "@/lib/services/penalties";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const result = await revokePenalty(id, auth.organizerProfile.id);
  if (result.error) {
    const map: Record<string, [number, string]> = {
      not_found: [404, "Penalty not found."],
      forbidden: [403, "You can only revoke penalties you issued."],
      already_revoked: [409, "That penalty was already revoked."],
    };
    const [status, message] = map[result.error] ?? [400, "Couldn't revoke it."];
    return NextResponse.json({ error: { code: result.error, message } }, { status });
  }
  return NextResponse.json(result.data);
}
