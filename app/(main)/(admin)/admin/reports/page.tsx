import { requireAdminPage } from "@/lib/admin-page";
import { listReportsForAdmin } from "@/lib/services/organizer-reports";
import { SectionHeading } from "@/components/ui/Panel";
import ReportsManager from "./ReportsManager";

export default async function AdminPlayerReportsPage() {
  await requireAdminPage("reports");
  const orgs = await listReportsForAdmin();

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Player reports</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          Players who took part in a paid or prized event can report its organizer. Enough different players reporting one
          organizer pause its new paid registrations and new paid or prized events until you review. Entry fees and prizes
          never go through BattleKrypt, so there is no refund here: you can pause, resume, or ban.
        </p>
      </div>
      <ReportsManager
        orgs={orgs.map((o) => ({
          id: o.id,
          userId: o.userId,
          orgName: o.orgName,
          email: o.user.email ?? "no email",
          pausedAt: o.reportsPausedAt ? o.reportsPausedAt.toISOString() : null,
          pauseReason: o.reportsPauseReason,
          reports: o.reports.map((r) => ({
            id: r.id,
            kind: r.kind,
            description: r.description,
            status: r.status,
            adminNote: r.adminNote,
            createdAt: r.createdAt.toISOString(),
            reporter: r.reporterName,
            tournament: r.tournament.name,
          })),
        }))}
      />
    </div>
  );
}
