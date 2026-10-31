// Turns a payment-dispute service error into an HTTP response.
import { NextResponse } from "next/server";
import type { DisputeError } from "@/lib/services/payment-disputes";

const MAP: Record<DisputeError, [number, string]> = {
  not_found: [404, "Case not found."],
  forbidden: [403, "You can't do that on this case."],
  validation_error: [400, "Check what you entered."],
  not_allowed: [409, "You can't open this kind of case right now."],
  already_open: [409, "There is already an open case for this entry."],
  rate_limited: [429, "You've opened too many cases today. Try again tomorrow."],
  wrong_state: [409, "This case can't be changed that way right now."],
};

export function disputeError(r: { error: DisputeError; message?: string }) {
  const [status, fallback] = MAP[r.error];
  return NextResponse.json({ error: { code: r.error, message: r.message ?? fallback } }, { status });
}
