"use client";

import InfiniteList, { type Column } from "@/components/admin/InfiniteList";
import type { Page } from "@/components/admin/useInfiniteSearch";
import type { ClubRow } from "@/lib/services/admin-lists";
import InitialTile from "@/components/ui/InitialTile";

const columns: Column<ClubRow>[] = [
  {
    header: "Club",
    cell: (c) => (
      <div className="flex items-center gap-2.5 min-w-0">
        <InitialTile name={c.name} size={32} src={c.logoUrl} />
        <span className="text-bk-heading truncate">{c.name}</span>
      </div>
    ),
  },
  {
    header: "Owner",
    cell: (c) => (
      <div className="min-w-0">
        <p className="text-bk-heading truncate">{c.ownerName}</p>
        <p className="text-bk-muted truncate">{c.ownerEmail}</p>
      </div>
    ),
  },
  { header: "Status", cell: (c) => <span className={c.status === "disbanded" ? "text-bk-live" : ""}>{c.status}</span> },
  { header: "Plan", cell: (c) => `${c.paid ? "Paid" : "Free"}${c.paymentPending ? " (payment pending)" : ""}` },
  { header: "Teams", cell: (c) => c.teams },
  { header: "Players", cell: (c) => c.players },
  { header: "Created", className: "text-bk-muted", cell: (c) => new Date(c.createdAt).toLocaleDateString("en-GB") },
];

export default function ClubsList({ initial }: { initial: Page<ClubRow> }) {
  return (
    <InfiniteList<ClubRow>
      endpoint="/api/admin/clubs/search"
      initial={initial}
      columns={columns}
      placeholder="Search club, owner name or email"
      searchLabel="Search clubs"
      empty="No clubs match that search."
    />
  );
}
