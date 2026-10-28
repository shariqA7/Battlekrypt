// Pure data (no database imports) so client components can use it too.
export type ReportKindT = "rejected_after_paying" | "not_delivered" | "refund_not_received" | "misleading" | "other";

export const REPORT_KINDS: ReportKindT[] = ["rejected_after_paying", "not_delivered", "refund_not_received", "misleading", "other"];

export const REPORT_KIND_LABEL: Record<ReportKindT, string> = {
  rejected_after_paying: "I paid but was rejected",
  not_delivered: "The event didn't happen, or the organizer disappeared",
  refund_not_received: "The event was cancelled and I wasn't refunded",
  misleading: "The event is fake or misleading",
  other: "Something else",
};
