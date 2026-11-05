// POST /api/giveaways/winners/:winnerId — what a winner does about their prize.
//   { action: "details", name, phone, address?, note? }  send (or correct) delivery details
//   { action: "confirm" }                                I received it
//   { action: "dispute", note }                          I was told it was sent but it didn't arrive
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { confirmReceived, disputeDelivery, submitWinnerDetails } from "@/lib/services/giveaways";
import { giveawayError } from "@/lib/giveaway-http";

export async function POST(request: Request, { params }: { params: Promise<{ winnerId: string }> }) {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const { winnerId } = await params;
  const b = await request.json().catch(() => ({}));
  const userId = auth.user.id;
  const result =
    b.action === "details" ? await submitWinnerDetails({ userId, winnerId, details: { name: b.name, phone: b.phone, address: b.address, note: b.note } })
    : b.action === "confirm" ? await confirmReceived({ userId, winnerId })
    : b.action === "dispute" ? await disputeDelivery({ userId, winnerId, note: typeof b.note === "string" ? b.note : "" })
    : ({ error: "validation_error", message: "Unknown action." } as const);
  if ("error" in result) return giveawayError(result);
  return NextResponse.json(result.data);
}
