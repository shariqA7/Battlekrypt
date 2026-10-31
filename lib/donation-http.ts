import { NextResponse } from "next/server";
import type { DonationError } from "@/lib/services/donations";

const MESSAGES: Record<string, { status: number; message: string }> = {
  feature_off: { status: 403, message: "Donations are switched off right now." },
  not_found: { status: 404, message: "Not found." },
  not_verified: { status: 403, message: "This is for verified members. Get a paid plan to give or enter, then try again." },
  campaign_closed: { status: 409, message: "This campaign has closed." },
  rate_limited: { status: 429, message: "You've sent a lot of donations today. Please try again tomorrow." },
  not_pending: { status: 409, message: "Someone already reviewed this donation." },
  over_balance: { status: 409, message: "That is more than the fund (or the campaign) holds." },
  conflict: { status: 409, message: "Another change happened at the same moment. Please try again." },
};

export function donationError(result: DonationError) {
  const m = MESSAGES[result.error];
  const message = "message" in result ? result.message : (m?.message ?? "Invalid request.");
  return NextResponse.json({ error: { code: result.error, message } }, { status: m?.status ?? 400 });
}
