import { requireAdminPage } from "@/lib/admin-page";
import { institutionCounts, listInstitutionsForAdmin } from "@/lib/services/institutions";
import { Stat } from "@/components/admin/charts";
import ReviewButtons from "./ReviewButtons";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { SectionHeading } from "@/components/ui/Panel";


export default async function AdminInstitutionsPage() {
  await requireAdminPage();
  const [counts, institutions] = await Promise.all([institutionCounts(), listInstitutionsForAdmin()]);

  return (
    <div className="space-y-5">
      <SectionHeading>Institutes</SectionHeading>
      <p className="font-sans text-[13px] text-bk-muted pl-[19px]">
        Organizations register the institute they run. Verify it once; after that the institute
        itself approves players for its own tournaments.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Awaiting verification" value={counts.pending} />
        <Stat label="Verified" value={counts.verified} />
      </div>

      {institutions.length === 0 && (
        <p className="font-sans text-[13px] text-bk-muted">No institutes registered yet.</p>
      )}

      <div className="space-y-4">
        {institutions.map((i) => (
          <Panel key={i.id} className="p-4 font-sans text-[13px]">
            <p className="text-bk-heading font-bold break-words flex flex-wrap items-center gap-2">
              {i.name}
              <Badge tone={i.verified ? "teal" : "amber"}>{i.verified ? "Verified" : "Not verified"}</Badge>
            </p>
            <p className="text-bk-muted break-words">
              {i.organizer.orgName} · {i.organizer.user.email} · {i._count.members} member
              {i._count.members === 1 ? "" : "s"}
            </p>
            <p className="text-bk-muted text-[11px] mt-1">Registered {i.createdAt.toLocaleString()}</p>
            <ReviewButtons id={i.id} verified={i.verified} />
          </Panel>
        ))}
      </div>
    </div>
  );
}
