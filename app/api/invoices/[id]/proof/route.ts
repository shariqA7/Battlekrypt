// POST /api/invoices/:id/proof — { proofUrl, methodId?, reference? }
// The organization uploads its payment screenshot; an admin then checks it and marks the invoice paid.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitInvoiceProof } from "@/lib/services/invoices";
import { invoiceError } from "@/lib/invoice-helpers";
import { banGuard } from "@/lib/services/bans";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in required." } }, { status: 401 });
  const banned = await banGuard(user.id);
  if (banned) return banned;

  const b = await request.json().catch(() => ({}));
  const result = await submitInvoiceProof(user.id, id, { proofUrl: b.proofUrl, methodId: b.methodId, reference: b.reference });
  if ("error" in result) return invoiceError(result);
  return NextResponse.json(result.data);
}
