import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyInvoice } from "@/lib/services/invoices";
import { listPaymentMethods } from "@/lib/services/payment-methods";
import { formatMoney } from "@/lib/money";
import InvoiceDocument from "@/components/invoices/InvoiceDocument";
import CopyButton from "@/components/invoices/CopyButton";
import ProofForm from "./ProofForm";

type Method = Awaited<ReturnType<typeof listPaymentMethods>>[number];

function Row({ label, value, mono = true, copy = false }: { label: string; value: string | null; mono?: boolean; copy?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap gap-x-3 py-0.5">
      <dt className="text-bk-muted w-36 shrink-0">{label}</dt>
      <dd className={`text-bk-heading break-all ${mono ? "font-mono" : ""}`}>
        {value}
        {copy && <CopyButton value={value} />}
      </dd>
    </div>
  );
}

function MethodCard({ m }: { m: Method }) {
  return (
    <div className="bg-bk-bg border border-bk-border p-3 font-sans text-[12px]">
      <p className="font-bold text-[13px] text-bk-heading mb-1">{m.name}</p>
      <dl>
        {m.type === "bank" && (
          <>
            <Row label="Bank" value={m.bankName} mono={false} />
            <Row label="Account title" value={m.accountTitle} mono={false} />
            <Row label="Account number" value={m.accountNumber} copy />
            <Row label="IBAN" value={m.iban} copy />
            <Row label="Branch" value={m.branch} mono={false} />
            <Row label="SWIFT / BIC" value={m.swiftCode} copy />
          </>
        )}
        {m.type === "wallet" && (
          <>
            <Row label="Name on account" value={m.accountTitle} mono={false} />
            <Row label="Wallet number" value={m.walletNumber} copy />
          </>
        )}
        {m.type === "crypto" && (
          <>
            <Row label="Coin" value={m.cryptoAsset} />
            <Row label="Network" value={m.cryptoNetwork} mono={false} />
            <Row label="Address" value={m.cryptoAddress} copy />
            <Row label="Memo / tag" value={m.cryptoMemo} copy />
          </>
        )}
      </dl>
      {m.type === "crypto" && (
        <p className="text-bk-live mt-2">Send only {m.cryptoAsset} on {m.cryptoNetwork}. Another coin or network will lose the money.</p>
      )}
      {m.instructions && <p className="text-bk-body mt-2 whitespace-pre-wrap">{m.instructions}</p>}
    </div>
  );
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/invoices/${id}`);

  const mine = await getMyInvoice(user.id, id);
  if (!mine) notFound();
  const { invoice: i, status } = mine;
  const open = i.status === "unpaid";
  const methods = open ? await listPaymentMethods({ activeOnly: true, currency: i.currency }) : [];

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full space-y-5">
      <p className="font-sans text-[12px]"><Link href="/invoices" className="text-bk-gold-light underline">← My invoices</Link></p>
      <InvoiceDocument invoice={{ ...i, orgName: i.organizer.orgName }} status={status} />

      {i.status === "paid" && (
        <p className="font-sans text-[13px] text-bk-teal">
          Paid on {i.paidAt?.toLocaleDateString("en-GB")}. Thank you.
          {i.planName ? ` Your ${i.planName} plan is active — see it on My plans.` : ""}
        </p>
      )}
      {i.status === "waived" && (
        <p className="font-sans text-[13px] text-bk-teal">
          This invoice was waived — there is nothing to pay.{i.planName ? ` Your ${i.planName} plan is active.` : ""}
        </p>
      )}
      {i.status === "cancelled" && <p className="font-sans text-[13px] text-bk-muted">This invoice was cancelled{i.cancelNote ? `: ${i.cancelNote}` : "."}</p>}
      {i.status === "proof_submitted" && (
        <p className="font-sans text-[13px] text-bk-amber">
          We received your payment proof and are checking it. You will get a notification as soon as the invoice is marked paid.
        </p>
      )}

      {open && (
        <>
          {i.proofRejectedNote && (
            <p className="font-sans text-[13px] text-bk-live border border-bk-live/40 p-3">
              Your last payment proof was not accepted: {i.proofRejectedNote}
            </p>
          )}
          <section>
            <h2 className="font-sans font-bold text-[15px] text-bk-heading mb-1">How to pay</h2>
            <p className="font-sans text-[12px] text-bk-muted mb-3">
              Send exactly <span className="font-mono text-bk-heading">{formatMoney(Number(i.total.toString()), i.currency)}</span> using one of these, then upload a screenshot below. Pay only to the details shown here.
            </p>
            {methods.length === 0 ? (
              <p className="font-sans text-[13px] text-bk-muted">No payment method is set up for {i.currency} yet. Please contact support before paying.</p>
            ) : (
              <div className="space-y-3">{methods.map((m) => <MethodCard key={m.id} m={m} />)}</div>
            )}
          </section>
          <ProofForm invoiceId={i.id} methods={methods.map((m) => ({ id: m.id, name: m.name, type: m.type }))} />
        </>
      )}
    </main>
  );
}
