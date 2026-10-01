import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { approveClub } from "@/lib/services/clubs";

// Optional body: { amount, currency, method, reference } — records the
// payment being approved so it shows up in the admin revenue totals.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const payment =
    body && body.amount !== undefined && body.amount !== ""
      ? {
          amount: Number(body.amount),
          currency: String(body.currency ?? ""),
          method: String(body.method ?? ""),
          reference: typeof body.reference === "string" ? body.reference : null,
        }
      : undefined;

  const result = await approveClub(id, auth.admin.id, payment);
  if (result.error === "invalid_payment") {
    return NextResponse.json(
      { error: { code: "invalid_payment", message: "Enter a valid amount, currency and payment method." } },
      { status: 400 }
    );
  }
  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Club not found." } },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
}
