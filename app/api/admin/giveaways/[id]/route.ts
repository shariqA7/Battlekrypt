// POST /api/admin/giveaways/:id
//   { action: "approve" }                 an organizer's giveaway waiting for review goes live
//   { action: "reject", note }            ...or is turned down
//   { action: "activate" }                an admin's draft goes live
//   { action: "draw", early? }            draw the winners (early closes it before its end date)
//   { action: "cancel", reason }
//   { action: "verified_only", value }    who may enter: only verified members (a paid plan), or everyone
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { activateGiveaway, cancelGiveaway, drawWinners, reviewGiveaway, setGiveawayVerifiedOnly } from "@/lib/services/giveaways";
import { giveawayError } from "@/lib/giveaway-http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("giveaways");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const adminId = auth.admin.id;
  const actor = { userId: adminId, isAdmin: true };
  const result =
    b.action === "approve" ? await reviewGiveaway({ adminId, id, approve: true })
    : b.action === "reject" ? await reviewGiveaway({ adminId, id, approve: false, note: typeof b.note === "string" ? b.note : "" })
    : b.action === "activate" ? await activateGiveaway({ adminId, id })
    : b.action === "draw" ? await drawWinners({ actor, id, early: b.early === true })
    : b.action === "cancel" ? await cancelGiveaway({ actor, id, reason: typeof b.reason === "string" ? b.reason : "" })
    : b.action === "verified_only" ? await setGiveawayVerifiedOnly({ adminId, id, verifiedOnly: b.value })
    : ({ error: "validation_error", message: "Unknown action." } as const);
  if ("error" in result) return giveawayError(result);
  return NextResponse.json(result.data);
}
