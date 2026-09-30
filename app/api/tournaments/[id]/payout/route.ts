// POST /api/tournaments/:id/payout — organizer confirms prize money for a
// completed tournament has actually gone out (spec §10's payout-confirmed
// gate on "Total Prize Pool Distributed").
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { markPayoutConfirmed } from "@/lib/services/tournaments";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const result = await markPayoutConfirmed(id, auth.organizerProfile.userId);

  const errorMap: Record<string, { status: number; message: string }> = {
    not_found: { status: 404, message: "Tournament not found." },
    forbidden: { status: 403, message: "You don't own this tournament." },
    not_completed: { status: 409, message: "Only completed tournaments can confirm payout." },
    no_prize_pool: { status: 409, message: "This tournament has no prize pool to distribute." },
  };

  if (result.error) {
    const mapped = errorMap[result.error];
    return NextResponse.json(
      { error: { code: result.error, message: mapped.message } },
      { status: mapped.status }
    );
  }

  return NextResponse.json(result.data);
}
