import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyInvoices } from "@/lib/services/invoices";
import { formatMoney } from "@/lib/money";
import InvoiceStatusBadge from "@/components/invoices/StatusBadge";

export default async function MyInvoicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/invoices");
  const invoices = await listMyInvoices(user.id);

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-2">My invoices</h1>
      <p className="font-sans text-bk-body text-[13px] mb-6">Bills for your organization&apos;s plan. Open one to see how to pay.</p>
      {invoices.length === 0 ? (
        <p className="font-sans text-bk-muted text-sm">You have no invoices.</p>
      ) : (
        <ul className="space-y-2">
          {invoices.map((i) => (
            <li key={i.id}>
              <Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 bg-bk-surface border border-bk-border p-3 hover:border-bk-border-nav">
                <span>
                  <span className="block font-mono text-[13px] text-bk-heading">{i.number}</span>
                  <span className="block font-sans text-[11px] text-bk-muted">
                    {i.orgName} · issued {new Date(i.issuedAt).toLocaleDateString("en-GB")}
                    {i.dueDate ? ` · due ${new Date(`${i.dueDate}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" })}` : ""}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-mono text-[13px] text-bk-heading">{formatMoney(i.total, i.currency)}</span>
                  <InvoiceStatusBadge status={i.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
