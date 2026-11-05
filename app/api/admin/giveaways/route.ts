// POST /api/admin/giveaways — the platform runs a giveaway (often for a sponsoring brand).
// body: { title, description, prizeKind, prizeTitle, prizeValueUsd?, prizeImageUrl?, winnersCount, startsAt?, endsAt,
//         tournamentId?, sponsorName?, sponsorLogoUrl?, sponsorUrl?, verifiedOnly?, draft? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { createGiveaway } from "@/lib/services/giveaways";
import { giveawayError } from "@/lib/giveaway-http";

export async function POST(request: Request) {
  const auth = await requireAdmin("giveaways");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const result = await createGiveaway({ userId: auth.admin.id, isAdmin: true }, "platform", {
    title: b.title, description: b.description, prizeKind: b.prizeKind, prizeTitle: b.prizeTitle, prizeValueUsd: b.prizeValueUsd,
    prizeImageUrl: b.prizeImageUrl, winnersCount: b.winnersCount, startsAt: b.startsAt, endsAt: b.endsAt, tournamentId: b.tournamentId,
    sponsorName: b.sponsorName, sponsorLogoUrl: b.sponsorLogoUrl, sponsorUrl: b.sponsorUrl, verifiedOnly: b.verifiedOnly, draft: b.draft,
  });
  if ("error" in result) return giveawayError(result);
  return NextResponse.json(result.data, { status: 201 });
}
