// GET  /api/admin/invoices?q=&cursor=&limit=&filter=all|open|proof_submitted|overdue|paid|waived|cancelled
// POST /api/admin/invoices — create an invoice for an organization.
//   body: { organizerId, currency?, planCode?, planAmount?, includeSecurityFee?, securityFeeAmount?,
//           discountType? ("amount"|"percent"), discountValue?, discountReason?, dueDate? ("YYYY-MM-DD" or empty for none), taxRate?, note? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { parsePageQuery } from "@/lib/admin-paging";
import { createInvoice, listInvoicesPage, type InvoiceFilter } from "@/lib/services/invoices";
import { invoiceError } from "@/lib/invoice-helpers";

const FILTERS: InvoiceFilter[] = ["all", "open", "proof_submitted", "overdue", "paid", "waived", "cancelled"];

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const f = new URL(request.url).searchParams.get("filter") as InvoiceFilter | null;
  return NextResponse.json(await listInvoicesPage(parsePageQuery(request.url), f && FILTERS.includes(f) ? f : "all"));
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : v === "" || v === null || v === undefined ? null : Number(v));

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const result = await createInvoice({
    organizerId: String(b.organizerId ?? ""),
    source: "admin_manual",
    createdById: auth.admin.id,
    currency: typeof b.currency === "string" && b.currency ? b.currency : undefined,
    planCode: typeof b.planCode === "string" && b.planCode ? b.planCode : null,
    planAmount: num(b.planAmount),
    includeSecurityFee: b.includeSecurityFee === true,
    securityFeeAmount: num(b.securityFeeAmount),
    dueDate: b.dueDate,
    discountType: b.discountType === "percent" ? "percent" : "amount",
    discountValue: num(b.discountValue),
    discountReason: typeof b.discountReason === "string" ? b.discountReason : null,
    taxRate: num(b.taxRate),
    note: typeof b.note === "string" ? b.note : null,
  });
  if ("error" in result) return invoiceError(result);
  return NextResponse.json({ id: result.data.id, number: result.data.number }, { status: 201 });
}
