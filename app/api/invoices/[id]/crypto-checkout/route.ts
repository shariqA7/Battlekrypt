// POST /api/invoices/:id/crypto-checkout — open the NOWPayments page for one of your unpaid invoices.
// Returns { url }: send the organization there to pick a coin and pay.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { banGuard } from "@/lib/services/bans";
import { startCryptoCheckout } from "@/lib/services/nowpayments";
import { invoiceError } from "@/lib/invoice-helpers";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in required." } }, { status: 401 });
  const banned = await banGuard(user.id);
  if (banned) return banned;

  const r = await startCryptoCheckout(user.id, id);
  if ("error" in r) return invoiceError(r);
  return NextResponse.json(r.data);
}
