"use client";

import { useState } from "react";
import InfiniteList, { type Column } from "@/components/admin/InfiniteList";
import type { Page } from "@/components/admin/useInfiniteSearch";
import type { OrgRow } from "@/lib/services/admin-organizations";
import InitialTile from "@/components/ui/InitialTile";
import Avatar from "@/components/ui/Avatar";

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

const columns: Column<OrgRow>[] = [
  {
    header: "Name",
    cell: (o) => (
      <div className="flex items-center gap-2.5 min-w-0">
        <InitialTile name={o.name} size={32} />
        <div className="min-w-0">
          <p className="text-bk-heading font-bold truncate">{o.name}</p>
          {o.paused && <p className="text-bk-live text-[11px]">Paid events paused</p>}
        </div>
      </div>
    ),
  },
  {
    header: "Owner",
    cell: (o) => (
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar src={o.ownerAvatar} name={o.ownerName} size={28} />
        <div className="min-w-0">
          <p className="text-bk-heading truncate">{o.ownerName}</p>
          <p className="text-bk-muted truncate">{o.ownerEmail}</p>
        </div>
      </div>
    ),
  },
  { header: "Plan starts", className: "text-bk-muted whitespace-nowrap", cell: (o) => date(o.planStartedAt) },
  {
    header: "Plan ends",
    className: "whitespace-nowrap",
    cell: (o) =>
      o.planState === "free" ? (
        <span className="text-bk-muted">—</span>
      ) : o.planState === "no_expiry" ? (
        <span className="text-bk-muted">No expiry</span>
      ) : (
        <span className={o.planState === "expired" ? "text-bk-live" : "text-bk-muted"}>
          {date(o.planEndsAt)}
          {o.planState === "expired" && " (expired)"}
        </span>
      ),
  },
  { header: "Plan", cell: (o) => <span className="text-bk-gold-light">{o.planName}</span> },
  {
    header: "Type",
    cell: (o) =>
      o.type === "institute" ? (
        <span>
          Institute
          <span className={`ml-1.5 ${o.instituteVerified ? "text-bk-teal" : "text-bk-muted"}`}>{o.instituteVerified ? "· verified" : "· unverified"}</span>
        </span>
      ) : (
        "Organization"
      ),
  },
];

export default function OrganizationsList({ initial }: { initial: Page<OrgRow> }) {
  const [type, setType] = useState("");
  return (
    <InfiniteList<OrgRow>
      endpoint="/api/admin/organizations"
      initial={initial}
      columns={columns}
      params={type ? `type=${type}` : ""}
      placeholder="Search name, owner or email"
      searchLabel="Search organizations and institutes"
      rowHref={(o) => `/admin/organizations/${o.id}`}
      empty="No organizations or institutes match."
      toolbar={
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Show"
          className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[40px]"
        >
          <option value="">All types</option>
          <option value="organization">Organizations</option>
          <option value="institute">Institutes</option>
        </select>
      }
    />
  );
}
