// GET   /api/admin/invoice-settings
// PATCH /api/admin/invoice-settings — { paymentGatewayEnabled?, invoiceTaxRate?, invoiceTaxLabel?, renewalInvoicesEnabled?, renewalLeadDays? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { getInvoiceSettings, updateInvoiceSettings } from "@/lib/services/payment-methods";
import { methodError } from "@/lib/invoice-helpers";

export async function GET() {
  const auth = await requireAdmin("payments", "view");
  if ("response" in auth) return auth.response;
  return NextResponse.json(await getInvoiceSettings());
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin("payments");
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await updateInvoiceSettings(auth.admin.id, {
    paymentGatewayEnabled: body.paymentGatewayEnabled,
    invoiceTaxRate: body.invoiceTaxRate,
    invoiceTaxLabel: body.invoiceTaxLabel,
    renewalInvoicesEnabled: body.renewalInvoicesEnabled,
    renewalLeadDays: body.renewalLeadDays,
  });
  if ("error" in result) return methodError(result);
  return NextResponse.json(result.data);
}
