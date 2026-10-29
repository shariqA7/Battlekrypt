import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import { ADMIN_PAGE_SIZE } from "@/lib/admin-paging";
import { listOrganizationsPage } from "@/lib/services/admin-organizations";
import { listPlans } from "@/lib/services/plan-requests";
import { listPlanFields, describeExtras } from "@/lib/services/plan-fields";
import { getTrustConfig } from "@/lib/services/organizer-trust";
import { describeLimits, PAID_PERKS } from "@/lib/plan-copy";
import { formatMoney } from "@/lib/money";
import { Stat } from "@/components/admin/charts";
import { SectionHeading } from "@/components/ui/Panel";
import OrganizationsList from "./OrganizationsList";
import AddOrganizationSheet, { type PlanCardData, type StarterRules } from "./AddOrganizationSheet";

export default async function AdminOrganizationsPage() {
  await requireAdminPage();
  const [initial, allPlans, fields, cfg, institutes, pending, rejected, total, unverified] = await Promise.all([
    listOrganizationsPage({ q: "", cursor: null, limit: ADMIN_PAGE_SIZE }),
    listPlans({ audience: "organizer", activeOnly: true }),
    listPlanFields("organizer"),
    getTrustConfig(),
    prisma.institution.count(),
    prisma.organizationApplication.count({ where: { status: "pending" } }),
    prisma.organizationApplication.count({ where: { status: "rejected" } }),
    prisma.organizerProfile.count(),
    prisma.institution.count({ where: { verified: false } }),
  ]);

  const plans: PlanCardData[] = allPlans.map((p) => ({
    code: p.code,
    name: p.name,
    isPaid: p.isPaid,
    price: p.isPaid && p.priceAmount !== null && p.priceCurrency ? formatMoney(p.priceAmount, p.priceCurrency) : null,
    days: p.durationDays,
    deposit: p.depositAmount && p.priceCurrency ? formatMoney(p.depositAmount, p.priceCurrency) : null,
    priceAmount: p.priceAmount,
    priceCurrency: p.priceCurrency,
    depositAmount: p.depositAmount,
    perks: [...describeLimits("organizer", p.limits), ...(p.isPaid ? PAID_PERKS : []), ...describeExtras(fields, p.extras).map((e) => `${e.label}: ${e.value}`)],
  }));
  const starter: StarterRules = {
    maxEntryFeeUsd: Number(cfg.starterMaxEntryFeeUsd.toString()),
    maxPrizeUsd: Number(cfg.starterMaxPrizeUsd.toString()),
    maxPaidEntrants: cfg.starterMaxPaidEntrants,
    graduationEvents: cfg.graduationEvents,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SectionHeading>Organizations</SectionHeading>
        <AddOrganizationSheet plans={plans} starter={starter} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Organizations & institutes" value={total} hint={`${institutes} institute${institutes === 1 ? "" : "s"}`} />
        <Stat label="Pending review" value={pending} />
        <Stat label="Rejected (fixing)" value={rejected} />
        <Stat label="Institutes to verify" value={unverified} />
      </div>
      <OrganizationsList initial={initial} />
    </div>
  );
}
