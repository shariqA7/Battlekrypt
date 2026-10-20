// POST /api/registrations/:id/no-show — report a no-show (online or on-site).
// Body: { note?: string, penalty?: "none"|"warning"|"point_deduction"|"disqualification", points?: number }
// The penalty is the ORGANIZER's: the tournament's no-show policy. Only the host
// organizer may choose a different one for a given case.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { reportNoShow } from "@/lib/services/penalties";

const MESSAGES: Record<string, [number, string]> = {
  not_found: [404, "Entry not found."],
  forbidden: [403, "You can't act on this entry."],
  already_disqualified: [409, "This entry is already disqualified."],
  not_active: [409, "Only pending or approved entries can be reported."],
  closed: [409, "This tournament was cancelled."],
  already_reported: [409, "A no-show is already recorded for this entry. Revoke it first to change it."],
  only_organizer_chooses: [403, "The organizer decides the penalty for a no-show."],
  points_required: [400, "Enter how many points to deduct."],
  points_invalid: [400, "Points must be a whole number from 1 to 1000."],
  no_penalty_configured: [409, "The organizer hasn't set a no-show penalty yet. Set one first, or choose a penalty for this case."],
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const penalty = ["none", "warning", "point_deduction", "disqualification"].includes(body.penalty) ? body.penalty : undefined;
  const result = await reportNoShow(id, auth.organizerProfile.id, {
    penalty,
    points: body.points === undefined || body.points === null || body.points === "" ? null : Number(body.points),
    note: typeof body.note === "string" ? body.note : undefined,
  });
  if (result.error) {
    const [status, message] = MESSAGES[result.error] ?? [400, "Couldn't record the no-show."];
    return NextResponse.json({ error: { code: result.error, message } }, { status });
  }
  return NextResponse.json({ id: result.data.id, kind: result.data.kind, points: result.data.points }, { status: 201 });
}
