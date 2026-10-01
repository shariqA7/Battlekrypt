import { requireAdminPage } from "@/lib/admin-page";
import { listOrganizations } from "@/lib/services/admin-analytics";
import { Stat } from "@/components/admin/charts";

export default async function AdminOrganizationsPage() {
  await requireAdminPage();
  const { organizers, applications } = await listOrganizations();
  const n = (s: string) => applications.find((a) => a.status === s)?._count ?? 0;

  return (
    <div className="space-y-5">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Organizations</h1>
      <div className="grid grid-cols-3 gap-3">
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
              <th className="px-3 py-2">Tournaments</th>
              <th className="px-3 py-2">Members</th>
              <th className="px-3 py-2">Since</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bk-border">
            {organizers.map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2 text-bk-heading">{o.orgName}</td>
                <td className="px-3 py-2 text-bk-muted">{o.user.email}</td>
                <td className="px-3 py-2 text-bk-gold-light">{o.planCode.replace("organizer_", "")}</td>
                <td className="px-3 py-2">{o._count.tournaments}</td>
                <td className="px-3 py-2">{o._count.members}</td>
                <td className="px-3 py-2 text-bk-muted">{o.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
