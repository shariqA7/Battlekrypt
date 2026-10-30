import { STATUS_LABEL, type DisplayStatus } from "@/lib/invoice-math";

// Colours follow the product's meaning: amber = waiting, teal = done/active, red = needs attention.
const TONE: Record<DisplayStatus, string> = {
  unpaid: "text-bk-amber border-bk-amber/40",
  proof_submitted: "text-bk-amber border-bk-amber/40",
  paid: "text-bk-teal border-bk-teal/40",
  cancelled: "text-bk-muted border-bk-border",
  waived: "text-bk-teal border-bk-teal/40",
  overdue: "text-bk-live border-bk-live/40",
};

export default function InvoiceStatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span className={`inline-block font-sans font-bold text-[10px] uppercase tracking-[0.8px] border px-2 py-0.5 ${TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
