import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { recordPayment } from "@/lib/services/payments";
import { PAYMENT_KINDS } from "@/lib/payment-kinds";
import { prisma } from "@/lib/prisma";

// POST { email, kind, amount, currency, method, reference?, note? }
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const user = email
    ? await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } })
    : null;
  if (!user) {
    return NextResponse.json(
      { error: { code: "user_not_found", message: "No account with that email." } },
      { status: 404 }
    );
  }
  const kind = PAYMENT_KINDS.find((k) => k.value === body.kind)?.value;
  if (!kind) {
    return NextResponse.json(
      { error: { code: "invalid_kind", message: "Choose what the payment was for." } },
      { status: 400 }
    );
  }

  const result = await recordPayment(auth.admin.id, {
    userId: user.id,
    kind,
    amount: Number(body.amount),
    currency: String(body.currency ?? ""),
    method: String(body.method ?? ""),
    reference: typeof body.reference === "string" ? body.reference : null,
    note: typeof body.note === "string" ? body.note : null,
  });
  if (result.error) {
    const messages = {
      invalid_amount: "Enter an amount greater than zero.",
      invalid_currency: "Choose a supported currency.",
      method_required: "Enter how they paid (e.g. JazzCash, bank transfer).",
      user_not_found: "No account with that email.",
    } as const;
    return NextResponse.json(
      { error: { code: result.error, message: messages[result.error] } },
      { status: 400 }
    );
  }
  return NextResponse.json({ id: result.data.id }, { status: 201 });
}
