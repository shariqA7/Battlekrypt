import { requireAdminPage } from "@/lib/admin-page";
import { listPendingOrganizers } from "@/lib/services/tournaments";
import { listPendingApplications } from "@/lib/services/org-applications";
import AdminQueues from "../../AdminQueues";
import OrgApplications from "../../OrgApplications";

export default async function ApprovalsOrganizationsPage() {
  await requireAdminPage("approvals");
  const [orgApplications, pendingOrganizers] = await Promise.all([listPendingApplications(), listPendingOrganizers()]);

  return (
    <div className="space-y-10">
      <OrgApplications
        initial={orgApplications.map((a) => ({
          id: a.id,
          email: a.user.email,
          orgName: a.orgName,
          orgType: a.orgType,
          description: a.description,
          registrationNumber: a.registrationNumber,
          website: a.website,
          country: a.country,
          city: a.city,
          address: a.address,
          contactEmail: a.contactEmail,
          contactPhone: a.contactPhone,
          handlerName: a.handlerName,
          handlerRole: a.handlerRole,
          handlerPhone: a.handlerPhone,
          plan: a.plan,
          attemptCount: a.attemptCount,
          submittedAt: a.submittedAt.toISOString(),
        }))}
      />
      <AdminQueues show={["organizers"]} initialOrganizers={pendingOrganizers} />
    </div>
  );
}
