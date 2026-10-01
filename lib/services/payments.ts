import { prisma } from "@/lib/prisma";
import { isSupportedCurrency } from "@/lib/money";
import type { PaymentKind } from "@prisma/client";
export { PAYMENT_KINDS } from "@/lib/payment-kinds";

export interface PaymentInput {
  userId: string;
  kind: PaymentKind;
  amount: number;
  currency: string;
  method: string;
  reference?: string | null;
  note?: string | null;
}

export async function recordPayment(adminId: string, input: PaymentInput) {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 999_999_999) {
    return { error: "invalid_amount" as const };
  }
  if (!isSupportedCurrency(input.currency)) return { error: "invalid_currency" as const };
  if (!input.method.trim()) return { error: "method_required" as const };

  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) return { error: "user_not_found" as const };

  const payment = await prisma.paymentRecord.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      amount: input.amount.toFixed(2),
      currency: input.currency,
      method: input.method.trim().slice(0, 60),
      reference: input.reference?.trim().slice(0, 120) || null,
      note: input.note?.trim().slice(0, 500) || null,
      recordedById: adminId,
    },
  });
  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "recorded_payment",
      targetType: "PaymentRecord",
      targetId: payment.id,
      notes: `${input.amount} ${input.currency} via ${input.method}`,
    },
  });
  return { data: payment };
}
