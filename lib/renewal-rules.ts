// When does an organization get an automatic renewal invoice? Pure, so it can be tested.
//
// An invoice is created when a paid plan is within `leadDays` of ending (or ended up to
// GRACE_DAYS ago, in case the check missed it), the organization has auto-renew on, and nothing
// is already billing that plan end. It is due on the day the plan ends (or today, if that has
// passed). The security fee is not charged again: the first one is still held.

export const GRACE_DAYS = 14;
export const MIN_LEAD_DAYS = 1;
export const MAX_LEAD_DAYS = 60;

export type RenewalSkip =
  | "auto_renew_off"
  | "free_plan"
  | "no_expiry"
  | "not_due_yet"
  | "ended_long_ago"
  | "plan_not_for_sale"
  | "already_invoiced"
  | "invoice_open"
  | "request_pending";

export interface RenewalInput {
  now: Date;
  leadDays: number;
  autoRenew: boolean;
  onFreePlan: boolean;
  planExpiresAt: Date | null;
  planSellable: boolean; // an active, paid, priced organizer plan
  alreadyInvoicedForThisExpiry: boolean;
  openPlanInvoice: boolean;
  pendingPlanRequest: boolean;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function decideRenewal(i: RenewalInput): { ok: true; dueDate: string } | { ok: false; reason: RenewalSkip } {
  if (!i.autoRenew) return { ok: false, reason: "auto_renew_off" };
  if (i.onFreePlan) return { ok: false, reason: "free_plan" };
  if (!i.planExpiresAt) return { ok: false, reason: "no_expiry" };
  const day = 86_400_000;
  if (i.planExpiresAt.getTime() > i.now.getTime() + i.leadDays * day) return { ok: false, reason: "not_due_yet" };
  if (i.planExpiresAt.getTime() < i.now.getTime() - GRACE_DAYS * day) return { ok: false, reason: "ended_long_ago" };
  if (!i.planSellable) return { ok: false, reason: "plan_not_for_sale" };
  if (i.alreadyInvoicedForThisExpiry) return { ok: false, reason: "already_invoiced" };
  if (i.openPlanInvoice) return { ok: false, reason: "invoice_open" };
  if (i.pendingPlanRequest) return { ok: false, reason: "request_pending" };
  // Due on the day the plan ends; if that day has passed, due today.
  const due = i.planExpiresAt.getTime() < i.now.getTime() ? i.now : i.planExpiresAt;
  return { ok: true, dueDate: ymd(due) };
}

export const SKIP_LABEL: Record<RenewalSkip, string> = {
  auto_renew_off: "auto-renew is off",
  free_plan: "on the free plan",
  no_expiry: "plan has no expiry",
  not_due_yet: "not due yet",
  ended_long_ago: "ended long ago",
  plan_not_for_sale: "plan is no longer for sale or has no price",
  already_invoiced: "already invoiced",
  invoice_open: "has an unpaid plan invoice",
  request_pending: "has a plan request waiting",
};
