// POST /api/organizer/giveaways/:id — { action: "draw" } or { action: "cancel", reason }
// Only the organization's owner can do these.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { cancelGiveaway, drawWinners } from "@/lib/services/giveaways";
import { giveawayError } from "@/lib/giveaway-http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const actor = { userId: auth.organizerProfile.userId, isAdmin: false };
  const result =
    b.action === "draw" ? await drawWinners({ actor, id })
    : b.action === "cancel" ? await cancelGiveaway({ actor, id, reason: typeof b.reason === "string" ? b.reason : "" })
    : ({ error: "validation_error", message: "Unknown action." } as const);
  if ("error" in result) return giveawayError(result);
  return NextResponse.json(result.data);
}
