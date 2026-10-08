import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { listUsers } from "@/lib/services/admin-analytics";
import { countryName } from "@/lib/geo";
import BanUserButton from "../BanUserButton";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdminPage();
  const { q, page } = await searchParams;
  const { users, total, page: current, pageSize } = await listUsers({ q, page: Number(page) || 1 });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Users</h1>
          <p className="font-sans text-[13px] text-bk-body">{total} account{total === 1 ? "" : "s"}</p>
        </div>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search name or email" className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] px-3 h-[36px] w-56" />
          <button className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] uppercase px-3 h-[36px]">Search</button>
        </form>
      </div>

      <div className="overflow-x-auto border border-bk-border">
        <table className="w-full font-sans text-[12px]">
          <thead className="bg-bk-surface text-bk-muted text-left uppercase tracking-[0.6px] text-[10px]">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Roles</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2">Last seen from</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bk-border">
            {users.map((u) => {
              const visit = u.visits[0];
              return (
                <tr key={u.id} className="align-top">
                  <td className="px-3 py-2">
                    <p className="text-bk-heading">{u.displayName}</p>
                    <p className="text-bk-muted">{u.email}</p>
                  </td>
                  <td className="px-3 py-2 space-x-1">
                    {u.isAdmin && <span className="bg-bk-live-bg text-bk-live px-1.5 py-0.5">admin</span>}
                    {u.organizerProfile && <span className="bg-bk-bg text-bk-gold-light px-1.5 py-0.5">org · {u.organizerProfile.planCode.replace("organizer_", "")}</span>}
                    {u.clubProfile && u.clubProfile.status !== "disbanded" && (
                      <span className="bg-bk-bg text-bk-body px-1.5 py-0.5">
                        club{u.clubProfile.subscriptionPlanCode !== "club_free" ? " · paid" : ""}
                      </span>
                    )}
                    {u.bans.length > 0 && <span className="bg-bk-live text-white px-1.5 py-0.5">banned</span>}
                  </td>
                  <td className="px-3 py-2 text-bk-muted">{u.createdAt.toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-bk-muted">
                    {visit ? `${countryName(visit.country)} · ${visit.deviceType}` : "—"}
                  </td>
                  <td className="px-3 py-2">{!u.isAdmin && u.bans.length === 0 && <BanUserButton userId={u.id} name={u.displayName} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between font-sans text-[12px] text-bk-muted">
        <span>Page {current} of {pages}</span>
        <span className="space-x-4">
          {current > 1 && <Link href={link(current - 1)} className="underline">Previous</Link>}
          {current < pages && <Link href={link(current + 1)} className="underline">Next</Link>}
        </span>
      </div>
    </div>
  );
}
