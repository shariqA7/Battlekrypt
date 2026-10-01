import { requireAdminPage } from "@/lib/admin-page";
import { listClubs } from "@/lib/services/admin-analytics";

export default async function AdminClubsPage() {
  await requireAdminPage();
  const clubs = await listClubs();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Clubs &amp; teams</h1>
        <p className="font-sans text-[13px] text-bk-body">{clubs.length} clubs created</p>
      </div>
      <div className="overflow-x-auto border border-bk-border">
        <table className="w-full font-sans text-[12px]">
          <thead className="bg-bk-surface text-bk-muted text-left uppercase tracking-[0.6px] text-[10px]">
            <tr>
              <th className="px-3 py-2">Club</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Teams</th>
              <th className="px-3 py-2">Players</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bk-border">
            {clubs.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 text-bk-heading">{c.clubName}</td>
                <td className="px-3 py-2 text-bk-muted">{c.user.email}</td>
                <td className={`px-3 py-2 ${c.status === "disbanded" ? "text-bk-live" : ""}`}>{c.status}</td>
                <td className="px-3 py-2">{c.subscriptionPlanCode === "club_free" ? "Free" : "Paid"}{c.upgradeStatus === "pending" ? " (payment pending)" : ""}</td>
                <td className="px-3 py-2">{c._count.teams}</td>
                <td className="px-3 py-2">{c._count.roster}</td>
                <td className="px-3 py-2 text-bk-muted">{c.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
