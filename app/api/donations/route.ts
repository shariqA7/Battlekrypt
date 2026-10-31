// POST /api/donations — give to the community fund or a campaign.
// body: { campaignId?, amount, currency, proofUrl, reference (the transaction ID), message?, anonymous? }
// The donation waits for an admin to approve it.
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { banGuard } from "@/lib/services/bans";
import { createDonation } from "@/lib/services/donations";
import { donationError } from "@/lib/donation-http";

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const banned = await banGuard(auth.user.id);
  if (banned) return banned;
  const b = await request.json().catch(() => ({}));
  const result = await createDonation({
    userId: auth.user.id,
    campaignId: b.campaignId,
    amount: b.amount,
    currency: b.currency,
    proofUrl: b.proofUrl,
    reference: b.reference,
    message: b.message,
    anonymous: b.anonymous,
  });
  if ("error" in result) return donationError(result);
  return NextResponse.json(result.data, { status: 201 });
}
