// POST /api/organizer/giveaways — an organization starts a giveaway.
// body: { title, description, prizeKind ("physical"|"code"|"cash"), prizeTitle, prizeValueUsd, prizeImageUrl?,
//         winnersCount, startsAt?, endsAt, tournamentId? }
// Who may enter follows the platform setting (organizers can't change it). A prize above the review
// limit waits for an admin.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { createGiveaway } from "@/lib/services/giveaways";
import { giveawayError } from "@/lib/giveaway-http";

export async function POST(request: Request) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const result = await createGiveaway({ userId: auth.organizerProfile.userId, isAdmin: false }, "organizer", {
    title: b.title, description: b.description, prizeKind: b.prizeKind, prizeTitle: b.prizeTitle, prizeValueUsd: b.prizeValueUsd,
    prizeImageUrl: b.prizeImageUrl, winnersCount: b.winnersCount, startsAt: b.startsAt, endsAt: b.endsAt, tournamentId: b.tournamentId,
  });
  if ("error" in result) return giveawayError(result);
  return NextResponse.json(result.data, { status: 201 });
}
