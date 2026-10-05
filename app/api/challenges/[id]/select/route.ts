// POST /api/challenges/:id/select  { applicationIds: string[], confirm: true }
// The poster picks challengers. `confirm` must be true — the UI asks "are you
// sure?" first, and the server refuses to act without it.
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { selectApplicants } from "@/lib/services/challenge-applications";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.applicationIds) ? body.applicationIds.filter((x: unknown) => typeof x === "string") : [];

  const result = await selectApplicants(auth.user.id, id, ids, body.confirm === true);
  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: result.error === "not_found" ? 404 : result.error === "not_open" ? 409 : 400 }
    );
  }
  return NextResponse.json({ id: result.data.id, completeBy: result.data.completeBy });
}
