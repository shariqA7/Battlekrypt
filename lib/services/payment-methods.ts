// Admin-managed payment methods (bank, wallet, crypto, other) that organizations pay invoices
// through while the payment gateway is off. A method that has ever been used is never deleted,
// only switched off, so old payments keep their record.
import { prisma } from "@/lib/prisma";
import { validatePaymentMethod } from "@/lib/payment-method-rules";

export type PaymentMethodView = Awaited<ReturnType<typeof listPaymentMethods>>[number];

export async function listPaymentMethods(opts: { activeOnly?: boolean; currency?: string } = {}) {
  const rows = await prisma.paymentMethod.findMany({
    where: opts.activeOnly ? { isActive: true } : {},
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  // An empty currency list means "any currency".
  return opts.currency ? rows.filter((m) => m.currencies.length === 0 || m.currencies.includes(opts.currency!)) : rows;
}

type Fail = { error: "validation_error" | "not_found"; message: string };

export async function createPaymentMethod(adminId: string, input: Record<string, unknown>) {
  const checked = validatePaymentMethod(input);
  if (!checked.ok) return { error: "validation_error", message: checked.message } as Fail;
  const last = await prisma.paymentMethod.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const method = await prisma.paymentMethod.create({
    data: { ...checked.value, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
  await prisma.adminActionLog.create({
    data: { adminId, action: "created_payment_method", targetType: "PaymentMethod", targetId: method.id, notes: `${method.type}: ${method.name}` },
  });
  return { data: method };
}

export async function updatePaymentMethod(adminId: string, id: string, input: Record<string, unknown>) {
  const existing = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!existing) return { error: "not_found", message: "That payment method doesn't exist." } as Fail;

  // Only switching on/off or reordering: no need to re-validate every field.
  const onlyFlags = Object.keys(input).every((k) => k === "isActive" || k === "sortOrder");
  const data: Record<string, unknown> = {};
  if (typeof input.isActive === "boolean") data.isActive = input.isActive;
  if (typeof input.sortOrder === "number" && Number.isInteger(input.sortOrder)) data.sortOrder = input.sortOrder;

  if (!onlyFlags) {
    // The type of an existing method can't change (its fields would no longer match).
    const checked = validatePaymentMethod({ ...input, type: existing.type });
    if (!checked.ok) return { error: "validation_error", message: checked.message } as Fail;
    Object.assign(data, checked.value);
  }
  if (Object.keys(data).length === 0) return { error: "validation_error", message: "Nothing to update." } as Fail;

  const method = await prisma.paymentMethod.update({ where: { id }, data });
  await prisma.adminActionLog.create({
    data: { adminId, action: "updated_payment_method", targetType: "PaymentMethod", targetId: id, notes: Object.keys(data).join(", ") },
  });
  return { data: method };
}

// Deleting is only allowed for a method no invoice has used; otherwise switch it off.
export async function deletePaymentMethod(adminId: string, id: string) {
  const existing = await prisma.paymentMethod.findUnique({ where: { id }, include: { _count: { select: { invoices: true } } } });
  if (!existing) return { error: "not_found", message: "That payment method doesn't exist." } as Fail;
  if (existing._count.invoices > 0) {
    return { error: "validation_error", message: "This method has been used for payments, so it can't be deleted. Switch it off instead." } as Fail;
  }
  await prisma.paymentMethod.delete({ where: { id } });
  await prisma.adminActionLog.create({
    data: { adminId, action: "deleted_payment_method", targetType: "PaymentMethod", targetId: id, notes: existing.name },
  });
  return { data: { ok: true as const } };
}

// ---- invoicing settings (gateway switch + default tax) ----

export async function getInvoiceSettings() {
  const s = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  return {
    paymentGatewayEnabled: s?.paymentGatewayEnabled ?? false,
    invoiceTaxRate: Number(s?.invoiceTaxRate?.toString() ?? 0),
    invoiceTaxLabel: s?.invoiceTaxLabel ?? "Tax",
  };
}

export async function updateInvoiceSettings(adminId: string, input: { paymentGatewayEnabled?: unknown; invoiceTaxRate?: unknown; invoiceTaxLabel?: unknown }) {
  const data: { paymentGatewayEnabled?: boolean; invoiceTaxRate?: number; invoiceTaxLabel?: string } = {};
  if (input.paymentGatewayEnabled !== undefined) {
    if (typeof input.paymentGatewayEnabled !== "boolean") return { error: "validation_error", message: "Invalid gateway switch." } as Fail;
    data.paymentGatewayEnabled = input.paymentGatewayEnabled;
  }
  if (input.invoiceTaxRate !== undefined) {
    const r = input.invoiceTaxRate;
    if (typeof r !== "number" || !Number.isFinite(r) || r < 0 || r > 100) return { error: "validation_error", message: "Tax rate must be between 0 and 100." } as Fail;
    data.invoiceTaxRate = Math.round(r * 100) / 100;
  }
  if (input.invoiceTaxLabel !== undefined) {
    const l = typeof input.invoiceTaxLabel === "string" ? input.invoiceTaxLabel.trim() : "";
    if (l.length < 2 || l.length > 30) return { error: "validation_error", message: "The tax label must be 2–30 characters (e.g. GST, Sales tax)." } as Fail;
    data.invoiceTaxLabel = l;
  }
  if (Object.keys(data).length === 0) return { error: "validation_error", message: "Nothing to update." } as Fail;
  await prisma.siteSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
  await prisma.adminActionLog.create({
    data: { adminId, action: "updated_invoice_settings", targetType: "SiteSettings", targetId: "singleton", notes: Object.entries(data).map(([k, v]) => `${k}=${v}`).join(", ") },
  });
  return { data: await getInvoiceSettings() };
}
