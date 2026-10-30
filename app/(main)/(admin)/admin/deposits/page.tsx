import { requireAdminPage } from "@/lib/admin-page";
import { getDepositSettings, listDepositsForAdmin } from "@/lib/services/security-deposits";
import { SectionHeading } from "@/components/ui/Panel";
import DepositsManager from "./DepositsManager";

export default async function AdminDepositsPage() {
  await requireAdminPage("deposits");
  const [deposits, settings] = await Promise.all([listDepositsForAdmin(), getDepositSettings()]);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Security deposits</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          Held deposits back organizers&apos; events. After an organizer leaves the paid plan, refund once the{" "}
          {settings.refundDays}-day wait is over and nothing is unsettled. Refunds are sent by you (bank transfer); record the
          reference in the note. Processing fees and tax are never refunded.
        </p>
      </div>
      <DepositsManager
        rows={deposits.map((d) => ({
          id: d.id,
          org: d.organizer.orgName,
          email: d.organizer.user.email ?? "no email",
          amount: Number(d.amount.toString()),
          currency: d.currency,
          planCode: d.planCode,
          status: d.status,
          heldAt: d.heldAt.toISOString(),
          eligibleAt: d.refundEligibleAt ? d.refundEligibleAt.toISOString() : null,
          blockers: d.blockers,
        }))}
      />
    </div>
  );
}
