"use client";

import InfiniteList, { type Column } from "@/components/admin/InfiniteList";
import type { Page } from "@/components/admin/useInfiniteSearch";
import type { UserRow } from "@/lib/services/admin-lists";
import Avatar from "@/components/ui/Avatar";
import { countryName } from "@/lib/geo";
import BanUserButton from "../BanUserButton";

const columns: Column<UserRow>[] = [
  {
    header: "User",
    cell: (u) => (
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar src={u.avatarUrl} name={u.name} size={32} />
        <div className="min-w-0">
          <p className="text-bk-heading truncate">{u.name}</p>
          <p className="text-bk-muted truncate">{u.email}</p>
        </div>
      </div>
    ),
  },
  {
    header: "Roles",
    cell: (u) => (
      <div className="flex flex-wrap gap-1">
        {u.isAdmin && <span className="bg-bk-live-bg text-bk-live px-1.5 py-0.5">admin</span>}
        {u.organization && <span className="bg-bk-bg text-bk-gold-light px-1.5 py-0.5">org · {u.organization.plan}</span>}
        {u.club && <span className="bg-bk-bg text-bk-body px-1.5 py-0.5">club{u.club.paid ? " · paid" : ""}</span>}
        {u.banned && <span className="bg-bk-live text-white px-1.5 py-0.5">banned</span>}
      </div>
    ),
  },
  { header: "Joined", className: "text-bk-muted", cell: (u) => new Date(u.joinedAt).toLocaleDateString("en-GB") },
  { header: "Last seen from", className: "text-bk-muted", cell: (u) => (u.lastSeen ? `${countryName(u.lastSeen.country)} · ${u.lastSeen.device}` : "—") },
  { header: "", cell: (u) => !u.isAdmin && !u.banned && <BanUserButton userId={u.id} name={u.name} /> },
];

export default function UsersList({ initial }: { initial: Page<UserRow> }) {
  return (
    <InfiniteList<UserRow>
      endpoint="/api/admin/users/search"
      initial={initial}
      columns={columns}
      placeholder="Search name, email or phone"
      searchLabel="Search users"
      empty="No users match that search."
    />
  );
}
