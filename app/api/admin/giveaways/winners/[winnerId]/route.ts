// POST /api/admin/giveaways/winners/:winnerId
//   { action: "deliver", note }    mark the prize as sent (for giveaways the platform runs)
//   { action: "replace", reason }  give it to someone else, before it is delivered
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { markDelivered, replaceWinner } from "@/lib/services/giveaways";
import { giveawayError } from "@/lib/giveaway-http";

export async function POST(request: Request, { params }: { params: Promise<{ winnerId: string }> }) {
  const auth = await requireAdmin("giveaways");
  if ("response" in auth) return auth.response;
  const { winnerId } = await params;
  const b = await request.json().catch(() => ({}));
  const actor = { userId: auth.admin.id, isAdmin: true };
  const result =
    b.action === "deliver" ? await markDelivered({ actor, winnerId, note: typeof b.note === "string" ? b.note : "" })
    : b.action === "replace" ? await replaceWinner({ actor, winnerId, reason: typeof b.reason === "string" ? b.reason : "" })
    : ({ error: "validation_error", message: "Unknown action." } as const);
  if ("error" in result) return giveawayError(result);
  return NextResponse.json(result.data);
}
