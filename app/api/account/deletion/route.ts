import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { cancelDeletion, getDeletionOverview, requestDeletion } from "@/lib/services/account-deletion";

const noStore = { "Cache-Control": "no-store" };

// GET -> { state, blockers }: whether deletion is scheduled, and what stops it right now
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const overview = await getDeletionOverview(auth.user.id);
  if (!overview) return NextResponse.json({ error: { code: "not_found", message: "Account not found." } }, { status: 404, headers: noStore });
  return NextResponse.json(overview, { headers: noStore });
}

// POST { confirm: "DELETE MY ACCOUNT" } -> schedules deletion in 14 days (and emails you)
export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await requestDeletion({ userId: auth.user.id, confirm: body.confirm, origin: new URL(request.url).origin });
  if ("error" in result) {
    const map = {
      confirm_phrase: [400, "Type DELETE MY ACCOUNT to confirm."],
      blocked: [409, "Your account can't be deleted yet."],
      already_requested: [409, "Deletion is already scheduled."],
      not_found: [404, "Account not found."],
      not_requested: [409, "Nothing to do."],
    } as const;
    const [status, message] = map[result.error];
    return NextResponse.json({ error: { code: result.error, message }, blockers: result.blockers ?? [] }, { status, headers: noStore });
  }
  return NextResponse.json({ ok: true, dueAt: result.dueAt.toISOString() }, { status: 201, headers: noStore });
}

// DELETE -> cancels a scheduled deletion
export async function DELETE() {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const result = await cancelDeletion(auth.user.id);
  if ("error" in result) return NextResponse.json({ error: { code: result.error, message: "No deletion is scheduled." } }, { status: 409, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
