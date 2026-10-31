import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-page";
import { getInvoicePrintData } from "@/lib/services/invoice-print";
import InvoicePrint from "@/components/invoices/InvoicePrint";
import PrintButton from "@/components/invoices/PrintButton";

export default async function AdminPrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("payments");
  const { id } = await params;
  const data = await getInvoicePrintData(id, { admin: true });
  if (!data) notFound();

  return (
    <div>
      <div className="max-w-[780px] mx-auto mb-4 flex items-center justify-between gap-3">
        <Link href={`/admin/invoices/${id}`} className="font-sans text-[12px] text-bk-gold-light underline">← Back to the invoice</Link>
        <PrintButton />
      </div>
      <InvoicePrint data={data} />
    </div>
  );
}
