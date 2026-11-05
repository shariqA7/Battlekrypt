// POST /api/organizer/giveaways/winners/:winnerId
//   { action: "deliver", note }    the prize was sent (tracking number, how it was sent)
//   { action: "replace", reason }  give it to someone else (only after the winner's time to answer is up)
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { markDelivered, replaceWinner } from "@/lib/services/giveaways";
import { giveawayError } from "@/lib/giveaway-http";

export async function POST(request: Request, { params }: { params: Promise<{ winnerId: string }> }) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const { winnerId } = await params;
  const b = await request.json().catch(() => ({}));
  const actor = { userId: auth.organizerProfile.userId, isAdmin: false };
  const result =
    b.action === "deliver" ? await markDelivered({ actor, winnerId, note: typeof b.note === "string" ? b.note : "" })
    : b.action === "replace" ? await replaceWinner({ actor, winnerId, reason: typeof b.reason === "string" ? b.reason : "" })
    : ({ error: "validation_error", message: "Unknown action." } as const);
  if ("error" in result) return giveawayError(result);
  return NextResponse.json(result.data);
}
