import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-page";
import { getInvoiceDetail } from "@/lib/services/invoices";
import { listPaymentMethods } from "@/lib/services/payment-methods";
import { formatMoney } from "@/lib/money";
import InvoiceDocument from "@/components/invoices/InvoiceDocument";
import InvoiceActions from "./InvoiceActions";
import DuplicateProofBadge from "@/components/ui/DuplicateProofBadge";
import { findProofMatches } from "@/lib/services/proof-fingerprints";

export default async function AdminInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("payments");
  const { id } = await params;
  const detail = await getInvoiceDetail(id);
  if (!detail) notFound();
  const { invoice: i, status } = detail;
  const methods = (await listPaymentMethods({ activeOnly: true, currency: i.currency })).map((m) => ({ id: m.id, name: m.name }));
  const open = i.status === "unpaid" || i.status === "proof_submitted";
  const total = Number(i.total.toString());
  const duplicate = i.status === "proof_submitted" ? (await findProofMatches("invoice", [id])).get(id) : undefined;

  return (
    <div className="space-y-5 max-w-3xl">
      <p className="font-sans text-[12px]"><Link href="/admin/invoices" className="text-bk-gold-light underline">← All invoices</Link></p>

      <InvoiceDocument invoice={{ ...i, orgName: i.organizer.orgName }} status={status} />
      <p className="font-sans text-[12px]">
        <Link href={`/admin/invoices/${i.id}/print`} className="text-bk-gold-light underline">Print or save as PDF</Link>
      </p>

      <div className="bg-bk-surface border border-bk-border p-4 font-sans text-[12px] space-y-1">
        <p className="text-bk-muted uppercase tracking-[0.8px] text-[10px] mb-1">Organization</p>
        <p className="text-bk-heading">
          <Link href={`/admin/organizations/${i.organizerId}`} className="underline">{i.organizer.orgName}</Link>{" "}
          <span className="text-bk-muted">· {i.organizer.user.displayName} · {i.organizer.user.email}</span>
        </p>
        <p className="text-bk-muted">Created {i.source === "renewal" ? "automatically, to renew the plan" : i.source === "application_approved" ? "when the application was approved" : i.source === "admin_added" ? "when you added the organization" : "by an admin"}.</p>
      </div>

      {i.status === "proof_submitted" && i.proofUrl && (
        <div className="bg-bk-surface border border-bk-amber/40 p-4">
          <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-amber mb-2">
            Payment proof to check <DuplicateProofBadge match={duplicate} scope="admin" />
          </p>
          <p className="font-sans text-[12px] text-bk-body mb-2">
            Sent {i.proofSubmittedAt?.toLocaleString("en-GB")}
            {detail.proofMethodName ? ` · says they paid via ${detail.proofMethodName}` : ""}
            {i.proofReference ? ` · reference ${i.proofReference}` : ""}
          </p>
          <a href={`/api/proofs/invoice/${i.id}`} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/proofs/invoice/${i.id}`} alt="Payment screenshot" className="max-h-96 border border-bk-border" />
          </a>
          <p className="font-sans text-[11px] text-bk-muted mt-2">Check the money really arrived in your account before marking it paid. A screenshot alone is not proof.</p>
        </div>
      )}

      {i.status === "unpaid" && i.waivedNote && (
        <p className="font-sans text-[12px] text-bk-muted">Part of this invoice was waived: {i.waivedNote}</p>
      )}

      {i.proofRejectedNote && i.status === "unpaid" && (
        <p className="font-sans text-[12px] text-bk-muted">Last proof was rejected: {i.proofRejectedNote}</p>
      )}

      {i.status === "paid" && (
        <div className="bg-bk-surface border border-bk-teal/40 p-4 font-sans text-[12px] space-y-1">
          <p className="text-bk-teal uppercase tracking-[0.8px] text-[10px]">Payment recorded</p>
          <p className="text-bk-heading">{formatMoney(Number((i.paidAmount ?? i.total).toString()), i.currency)} via {detail.paidMethodName ?? "—"} on {i.paidAt?.toLocaleDateString("en-GB")}</p>
          {i.paidReference && <p className="text-bk-muted">Reference: <span className="font-mono">{i.paidReference}</span></p>}
          {i.paidNote && <p className="text-bk-muted">{i.paidNote}</p>}
        </div>
      )}
      {i.status === "waived" && (
        <div className="bg-bk-surface border border-bk-teal/40 p-4 font-sans text-[12px] space-y-1">
          <p className="text-bk-teal uppercase tracking-[0.8px] text-[10px]">Waived</p>
          <p className="text-bk-heading">Forgiven on {i.waivedAt?.toLocaleDateString("en-GB")}. Nothing was owed or recorded as income.</p>
          {i.waivedNote && <p className="text-bk-muted">{i.waivedNote}</p>}
        </div>
      )}
      {i.status === "cancelled" && <p className="font-sans text-[12px] text-bk-muted">Cancelled: {i.cancelNote}</p>}

      {open && <InvoiceActions invoiceId={i.id} total={total} currency={i.currency} methods={methods} hasProof={i.status === "proof_submitted"} hasPlanLine={i.lines.some((l) => l.kind === "plan" && !l.waived)} hasFeeLine={i.lines.some((l) => l.kind === "security_deposit" && !l.waived)} hasDiscount={i.lines.some((l) => l.kind === "discount")} currencyCode={i.currency} suggestedMethodId={i.proofMethodId} suggestedReference={i.proofReference} />}
    </div>
  );
}
