// POST /api/admin/invoices/:id/mark-paid     { amount, methodId? | methodName?, reference?, paidAt?, note? }
// POST /api/admin/invoices/:id/reject-proof  { note }
// POST /api/admin/invoices/:id/cancel        { note }
// POST /api/admin/invoices/:id/discount      { type: "amount"|"percent", value, reason? } or { remove: true }
// POST /api/admin/invoices/:id/waive         { note, waivePlan?, waiveSecurityFee? } — forgive the ticked parts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { cancelInvoice, markInvoicePaid, rejectInvoiceProof, setInvoiceDiscount, waiveInvoice } from "@/lib/services/invoices";
import { invoiceError } from "@/lib/invoice-helpers";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  const auth = await requireAdmin("payments");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));

  let result;
  if (action === "mark-paid") {
    result = await markInvoicePaid({
      adminId: auth.admin.id,
      invoiceId: id,
      methodId: typeof b.methodId === "string" && b.methodId ? b.methodId : null,
      methodName: typeof b.methodName === "string" ? b.methodName : null,
      reference: typeof b.reference === "string" ? b.reference : null,
      note: typeof b.note === "string" ? b.note : null,
      amount: Number(b.amount),
      paidAt: typeof b.paidAt === "string" && b.paidAt ? b.paidAt : null,
    });
  } else if (action === "reject-proof") {
    result = await rejectInvoiceProof(auth.admin.id, id, b.note);
  } else if (action === "discount") {
    result = await setInvoiceDiscount(auth.admin.id, id, { type: b.type, value: b.value, reason: b.reason, remove: b.remove === true });
  } else if (action === "waive") {
    result = await waiveInvoice(auth.admin.id, id, { reason: b.note, waivePlan: b.waivePlan === true, waiveSecurityFee: b.waiveSecurityFee === true });
  } else if (action === "cancel") {
    result = await cancelInvoice(auth.admin.id, id, b.note);
  } else {
    return NextResponse.json({ error: { code: "not_found", message: "Unknown action." } }, { status: 404 });
  }
  if ("error" in result) return invoiceError(result);
  return NextResponse.json({ ok: true });
}
