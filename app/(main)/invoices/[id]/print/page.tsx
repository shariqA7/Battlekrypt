import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInvoicePrintData } from "@/lib/services/invoice-print";
import InvoicePrint from "@/components/invoices/InvoicePrint";
import PrintButton from "@/components/invoices/PrintButton";

export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/invoices/${id}/print`);

  const data = await getInvoicePrintData(id, { userId: user.id });
  if (!data) notFound();

  return (
    <main className="flex-1 px-4 py-8 w-full">
      <div className="max-w-[780px] mx-auto mb-4 flex items-center justify-between gap-3">
        <Link href={`/invoices/${id}`} className="font-sans text-[12px] text-bk-gold-light underline">← Back to the invoice</Link>
        <PrintButton />
      </div>
      <InvoicePrint data={data} />
    </main>
  );
}
