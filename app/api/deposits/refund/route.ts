// POST /api/deposits/refund — the organizer leaves the paid plan and asks for
// their security deposit back. Plan drops to free now; refund follows after the
// waiting period if nothing is unsettled. Fees and tax are not refundable.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { banGuard } from "@/lib/services/bans";
import { requestDepositRefund } from "@/lib/services/security-deposits";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in required." } }, { status: 401 });
  }
  const banned = await banGuard(user.id);
  if (banned) return banned;

  const result = await requestDepositRefund(user.id);
  if ("error" in result) {
    const msg = result.error === "no_account" ? "Organizer account not found." : "You have no security deposit on hold.";
    return NextResponse.json({ error: { code: result.error, message: msg } }, { status: 400 });
  }
  return NextResponse.json({ eligibleAt: result.data.eligibleAt });
}
