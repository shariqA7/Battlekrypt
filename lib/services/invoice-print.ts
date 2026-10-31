// Everything the printable invoice (and receipt) needs. An organization can only load its own
// invoice; an admin page passes `admin: true` after its own permission check.
import { prisma } from "@/lib/prisma";
import { displayStatus } from "@/lib/invoice-math";
import { getInvoiceSettings, listPaymentMethods } from "@/lib/services/payment-methods";

export async function getInvoicePrintData(invoiceId: string, who: { userId: string } | { admin: true }) {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      organizer: { select: { orgName: true, user: { select: { displayName: true, email: true } } } },
    },
  });
  if (!inv) return null;
  if ("userId" in who && inv.userId !== who.userId) return null;

  const open = inv.status === "unpaid" || inv.status === "proof_submitted";
  const [settings, methods] = await Promise.all([
    getInvoiceSettings(),
    open ? listPaymentMethods({ activeOnly: true, currency: inv.currency }) : Promise.resolve([]),
  ]);
  return { invoice: inv, status: displayStatus(inv.status, inv.dueDate), settings, methods };
}

export type InvoicePrintData = NonNullable<Awaited<ReturnType<typeof getInvoicePrintData>>>;
