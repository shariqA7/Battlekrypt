// Automatic renewal invoices. A daily job (and an admin button) calls createDueRenewalInvoices():
// for every organization with auto-renew on whose paid plan is about to end, it creates one
// invoice for another period of the same plan, using the plan's current price and the default
// tax. It never repeats itself, and it skips anyone who already has something to pay or a plan
// request waiting. Paying the invoice extends the plan from its current end date.
import { prisma } from "@/lib/prisma";
import { FREE_PLAN_CODE } from "@/lib/plans";
import { decideRenewal, GRACE_DAYS, type RenewalSkip } from "@/lib/renewal-rules";
import { createInvoice } from "@/lib/services/invoices";
import { getInvoiceSettings } from "@/lib/services/payment-methods";

export interface RenewalRun {
  disabled: boolean;
  checked: number;
  created: { number: string; orgName: string }[];
  skipped: Partial<Record<RenewalSkip, number>>;
  failed: { orgName: string; message: string }[];
}

export async function createDueRenewalInvoices(now: Date = new Date()): Promise<RenewalRun> {
  const run: RenewalRun = { disabled: false, checked: 0, created: [], skipped: {}, failed: [] };
  const settings = await getInvoiceSettings();
  if (!settings.renewalInvoicesEnabled) return { ...run, disabled: true };

  const day = 86_400_000;
  const orgs = await prisma.organizerProfile.findMany({
    where: {
      autoRenew: true,
      planCode: { not: FREE_PLAN_CODE.organizer },
      planExpiresAt: { not: null, gte: new Date(now.getTime() - GRACE_DAYS * day), lte: new Date(now.getTime() + settings.renewalLeadDays * day) },
    },
    select: { id: true, userId: true, orgName: true, planCode: true, planExpiresAt: true },
  });
  const skip = (r: RenewalSkip) => { run.skipped[r] = (run.skipped[r] ?? 0) + 1; };

  for (const org of orgs) {
    run.checked += 1;
    try {
      const plan = await prisma.plan.findUnique({ where: { code: org.planCode } });
      const sellable = !!plan && plan.audience === "organizer" && plan.isPaid && plan.isActive && plan.priceAmount !== null && !!plan.priceCurrency;
      const [already, open, pending] = await Promise.all([
        prisma.invoice.count({ where: { organizerId: org.id, renewalForExpiry: org.planExpiresAt } }),
        prisma.invoice.count({ where: { userId: org.userId, status: { in: ["unpaid", "proof_submitted"] }, lines: { some: { kind: "plan", waived: false } } } }),
        prisma.planRequest.count({ where: { userId: org.userId, audience: "organizer", status: "pending" } }),
      ]);
      const d = decideRenewal({
        now,
        leadDays: settings.renewalLeadDays,
        autoRenew: true,
        onFreePlan: org.planCode === FREE_PLAN_CODE.organizer,
        planExpiresAt: org.planExpiresAt,
        planSellable: sellable,
        alreadyInvoicedForThisExpiry: already > 0,
        openPlanInvoice: open > 0,
        pendingPlanRequest: pending > 0,
      });
      if (!d.ok) { skip(d.reason); continue; }

      const r = await createInvoice({
        organizerId: org.id,
        source: "renewal",
        renewalForExpiry: org.planExpiresAt,
        currency: plan!.priceCurrency!,
        planCode: plan!.code,
        includeSecurityFee: false,
        dueDate: d.dueDate,
        note: `Renewal of the ${plan!.name} plan`,
      });
      if ("data" in r) run.created.push({ number: r.data.number, orgName: org.orgName });
      else run.failed.push({ orgName: org.orgName, message: r.message ?? r.error });
    } catch (e) {
      run.failed.push({ orgName: org.orgName, message: e instanceof Error ? e.message : "unknown error" });
    }
  }
  return run;
}

export async function setAutoRenew(adminId: string, organizerId: string, value: boolean) {
  const org = await prisma.organizerProfile.findUnique({ where: { id: organizerId }, select: { orgName: true, autoRenew: true } });
  if (!org) return { error: "not_found" as const };
  if (org.autoRenew !== value) {
    await prisma.organizerProfile.update({ where: { id: organizerId }, data: { autoRenew: value } });
    await prisma.adminActionLog.create({
      data: { adminId, action: value ? "enabled_auto_renew" : "disabled_auto_renew", targetType: "OrganizerProfile", targetId: organizerId, notes: org.orgName },
    });
  }
  return { data: { autoRenew: value } };
}
