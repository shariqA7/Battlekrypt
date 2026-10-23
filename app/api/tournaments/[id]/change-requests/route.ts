// POST /api/tournaments/:id/change-requests — ask an admin to change a locked
// paid or prized event. body: { kind, details, prizePoolAmount?, conditionsText? }
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { createChangeRequest, type ChangeKindT } from "@/lib/services/change-requests";

const KINDS = ["prize_pool", "cancel", "conditions", "other"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  if (!KINDS.includes(b.kind)) {
    return NextResponse.json({ error: { code: "validation_error", message: "Choose what you want changed." } }, { status: 400 });
  }
  const result = await createChangeRequest({
    organizerId: auth.organizerProfile.id,
    userId: auth.organizerProfile.userId,
    tournamentId: id,
    kind: b.kind as ChangeKindT,
    details: String(b.details ?? ""),
    prizeStructure: b.prizeStructure && typeof b.prizeStructure === "object" ? b.prizeStructure : undefined,
    conditionsText: typeof b.conditionsText === "string" ? b.conditionsText : undefined,
  });
  if ("error" in result) {
    const map: Record<string, { status: number; message: string }> = {
      not_found: { status: 404, message: "Tournament not found." },
      forbidden: { status: 403, message: "You don't own this tournament." },
      already_pending: { status: 409, message: "You already have a pending request of this kind." },
    };
    const m = map[result.error ?? ""] ?? { status: 400, message: "message" in result && result.message ? result.message : "Invalid request." };
    return NextResponse.json({ error: { code: result.error, message: "message" in result && result.message ? result.message : m.message } }, { status: m.status });
  }
  if ("applied" in result) return NextResponse.json({ applied: true });
  return NextResponse.json(result.data, { status: 201 });
}
