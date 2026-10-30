// Rules for moving an organization from one paid plan to another. Pure, so they can be tested.
//
//   Upgrade: takes effect when the invoice is paid. A new full period starts that day, and the
//            unused part of the old period is credited against the new plan fee.
//   Downgrade: takes effect when the current period ends (no refund). The next renewal invoice
//            bills the lower plan.
import { roundMoney } from "@/lib/invoice-math";

const DAY = 86_400_000;

export type ChangeKind = "upgrade" | "downgrade";

export interface PlanFacts {
  code: string;
  price: number | null;
  currency: string | null;
  sortOrder: number;
}

// The bigger plan costs more. When the two are priced in different currencies they can't be
// compared by price, so the admin's plan order decides.
export function classifyChange(current: PlanFacts, target: PlanFacts): ChangeKind | "same" {
  if (current.code === target.code) return "same";
  if (current.price !== null && target.price !== null && current.currency === target.currency) {
    if (target.price > current.price) return "upgrade";
    if (target.price < current.price) return "downgrade";
  }
  return target.sortOrder > current.sortOrder ? "upgrade" : "downgrade";
}

// Credit for the unused part of the current period: the old plan price x the share of the period
// still to run. Nothing is credited when the old plan was not paid for (free, or given by an admin
// with no end date), has run out, or was priced in another currency. The credit is always kept
// below the new plan fee, so an upgrade invoice can't come to zero (use Waive for that).
export function computeUpgradeCredit(i: {
  oldPrice: number | null;
  oldCurrency: string | null;
  oldPeriodDays: number;
  expiresAt: Date | null;
  now: Date;
  newFee: number;
  newCurrency: string;
}): { credit: number; remainingDays: number } {
  if (i.oldPrice === null || !(i.oldPrice > 0) || !i.expiresAt || i.oldCurrency !== i.newCurrency || !(i.oldPeriodDays > 0)) {
    return { credit: 0, remainingDays: 0 };
  }
  const remainingMs = i.expiresAt.getTime() - i.now.getTime();
  if (remainingMs <= 0) return { credit: 0, remainingDays: 0 };
  const remainingDays = Math.min(i.oldPeriodDays, Math.ceil(remainingMs / DAY));
  let credit = roundMoney((i.oldPrice * remainingDays) / i.oldPeriodDays, i.newCurrency);
  if (credit >= i.newFee) credit = roundMoney(Math.max(0, i.newFee - 1), i.newCurrency);
  return { credit, remainingDays };
}
