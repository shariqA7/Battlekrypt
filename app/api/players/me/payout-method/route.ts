// GET /api/players/me/payout-method — what is saved (never the account number).
// PUT — save or change it. Players 18+ only: for a player under 18 the parent/guardian
// sets this from the consent email link, so a child can't point their prizes anywhere.
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { prisma } from "@/lib/prisma";
import { getPayoutSummary, savePayoutMethod } from "@/lib/services/payout-methods";

const STATUS: Record<string, number> = { not_configured: 503, guardian_only: 403, not_found: 404 };

async function profileId(userId: string) {
  return (await prisma.playerProfile.findUnique({ where: { userId }, select: { id: true } }))?.id ?? null;
}

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const id = await profileId(auth.user.id);
  if (!id) return NextResponse.json({ error: { code: "not_found", message: "Finish your profile first." } }, { status: 404 });
  return NextResponse.json(await getPayoutSummary(id));
}

export async function PUT(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const id = await profileId(auth.user.id);
  if (!id) return NextResponse.json({ error: { code: "not_found", message: "Finish your profile first." } }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const result = await savePayoutMethod(id, "self", body);
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error, message: result.message } }, { status: STATUS[result.error] ?? 400 });
  }
  return NextResponse.json(result.data);
}
