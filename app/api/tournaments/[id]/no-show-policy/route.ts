// PATCH /api/tournaments/:id/no-show-policy — the organizer decides what a no-show costs.
// Body: { penalty: "none"|"warning"|"point_deduction"|"disqualification", points?: number }
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { setNoShowPolicy } from "@/lib/services/penalties";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await setNoShowPolicy(id, auth.organizerProfile.id, {
    penalty: body.penalty,
    points: body.points === undefined || body.points === null || body.points === "" ? null : Number(body.points),
  });
  if (result.error) {
    const map: Record<string, [number, string]> = {
      not_found: [404, "Tournament not found."],
      forbidden: [403, "Only the organizer can set the no-show penalty."],
      invalid_penalty: [400, "Choose none, warning, point deduction or disqualification."],
      points_required: [400, "Enter how many points to deduct."],
      points_invalid: [400, "Points must be a whole number from 1 to 1000."],
    };
    const [status, message] = map[result.error] ?? [400, "Couldn't save the policy."];
    return NextResponse.json({ error: { code: result.error, message } }, { status });
  }
  return NextResponse.json(result.data);
}
