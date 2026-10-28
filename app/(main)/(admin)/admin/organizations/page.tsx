import { requireAdminPage } from "@/lib/admin-page";
import { listOrganizations } from "@/lib/services/admin-analytics";
import { Stat } from "@/components/admin/charts";
import { SectionHeading } from "@/components/ui/Panel";
import { listPlans } from "@/lib/services/plan-requests";
import AddOrganizationForm from "./AddOrganizationForm";
import AssignPlan from "./AssignPlan";

export default async function AdminOrganizationsPage() {
  await requireAdminPage();
  const [{ organizers, applications }, allPlans] = await Promise.all([listOrganizations(), listPlans({ audience: "organizer" })]);
  const plans = allPlans.map((p) => ({ code: p.code, name: p.name, isPaid: p.isPaid }));
  const n = (s: string) => applications.find((a) => a.status === s)?._count ?? 0;

  return (
    <div className="space-y-5">
      <SectionHeading>Organizations</SectionHeading>
      <AddOrganizationForm plans={plans} />
      <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
        <Stat label="Approved" value={organizers.length} />
        <Stat label="Pending review" value={n("pending")} />
        <Stat label="Rejected (fixing)" value={n("rejected")} />
      </div>
      <div className="overflow-x-auto border border-bk-border">
        <table className="w-full font-sans text-[12px]">
          <thead className="bg-bk-surface text-bk-muted text-left uppercase tracking-[0.6px] text-[10px]">
            <tr>
              <th className="px-3 py-2">Organization</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Plan until</th>
              <th className="px-3 py-2">Tournaments</th>
              <th className="px-3 py-2">Members</th>
              <th className="px-3 py-2">Since</th>
              <th className="px-3 py-2">Plan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bk-border">
            {organizers.map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2 text-bk-heading">{o.orgName}</td>
                <td className="px-3 py-2 text-bk-muted">{o.user.email ?? "no email"}</td>
                <td className="px-3 py-2 text-bk-gold-light">{o.planCode.replace("organizer_", "")}</td>
                <td className="px-3 py-2 text-bk-muted">
                  {o.planCode === "organizer_free" ? "—" : o.planExpiresAt ? o.planExpiresAt.toLocaleDateString("en-GB") : "No expiry"}
                </td>
                <td className="px-3 py-2">{o._count.tournaments}</td>
                <td className="px-3 py-2">{o._count.members}</td>
                <td className="px-3 py-2 text-bk-muted">{o.createdAt.toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  <AssignPlan organizerId={o.id} currentPlan={o.planCode} plans={plans} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
