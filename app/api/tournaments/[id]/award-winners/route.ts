// POST /api/tournaments/:id/award-winners
// body: { assignments: [{ awardId, userId | null }] } — organizer picks who won
// each special award after the event completes.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { assignAwardWinners } from "@/lib/services/award-winners";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const list = Array.isArray(b.assignments) ? b.assignments : [];
  const assignments = list.map((x: { awardId?: unknown; userId?: unknown }) => ({
    awardId: String(x.awardId ?? ""),
    userId: typeof x.userId === "string" && x.userId ? x.userId : null,
  }));
  if (assignments.length === 0) {
    return NextResponse.json({ error: { code: "validation_error", message: "Nothing to save." } }, { status: 400 });
  }
  const result = await assignAwardWinners({ organizerId: auth.organizerProfile.id, tournamentId: id, assignments });
  if ("error" in result) {
    const map: Record<string, { status: number; message: string }> = {
      not_found: { status: 404, message: "Tournament not found." },
      forbidden: { status: 403, message: "You don't own this tournament." },
      not_completed: { status: 409, message: "You can pick award winners once the tournament is completed." },
    };
    const m = map[result.error ?? ""] ?? { status: 400, message: "message" in result && result.message ? result.message : "Invalid request." };
    return NextResponse.json({ error: { code: result.error, message: "message" in result && result.message ? result.message : m.message } }, { status: m.status });
  }
  return NextResponse.json(result.data);
}
