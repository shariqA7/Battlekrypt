import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getMyTournaments } from "@/lib/services/tournaments";
import { countPendingCoHostInvites } from "@/lib/services/institutions";
import Link from "next/link";
import { Badge, TierBadge } from "@/components/ui/Badge";
import InitialTile from "@/components/ui/InitialTile";
import LocalDate from "@/components/ui/LocalDate";
import Stat from "@/components/ui/Stat";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import { ButtonLink } from "@/components/ui/Button";
import { redirect } from "next/navigation";

import AdSlot from "@/components/ui/AdSlot";
import DashboardTop from "@/components/dashboard/DashboardTop";
const STATUS: Record<string, { label: string; tone: "teal" | "amber" | "danger" | "neutral" | "live" }> = {
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "neutral" },
  registration_open: { label: "Open", tone: "teal" },
  registration_closed: { label: "Closed", tone: "amber" },
  in_progress: { label: "Live", tone: "live" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export default async function OrganizerDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/dashboard");

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });

  if (!organizerProfile) redirect("/organizer/register");

  const userRecord = await prisma.user.findUnique({ where: { id: user.id } });
  const isApproved = userRecord?.kycStatus === "approved";

  const tournaments = await getMyTournaments(organizerProfile.id);
  const pendingInvites = await countPendingCoHostInvites(organizerProfile.id);

  return (
    <>
      <div className="w-full max-w-5xl mx-auto px-5 sm:px-6 pt-8">
        <DashboardTop />
      </div>
      <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <InitialTile name={organizerProfile.orgName} size={52} />
          <SectionHeading className="!text-[22px] sm:!text-[26px] break-words min-w-0 flex-1">
            {organizerProfile.orgName}
          </SectionHeading>
          <ButtonLink href="/organizer/dashboard/tournaments/new" className="w-full sm:w-auto">
            + New tournament
          </ButtonLink>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <ButtonLink href="/organizer/dashboard/institute" variant="outline" size="sm">
            My institute{pendingInvites > 0 ? ` (${pendingInvites})` : ""}
          </ButtonLink>
          <ButtonLink href="/organizer/dashboard/members" variant="outline" size="sm">
            Members
          </ButtonLink>
          <ButtonLink href="/organizer/dashboard/settings" variant="outline" size="sm">
            Profile settings
          </ButtonLink>
          <ButtonLink href="/organizer/dashboard/games" variant="outline" size="sm">
            Request a game
          </ButtonLink>
        </div>

        {!isApproved && (
          <p className="bg-bk-amber/[0.12] text-bk-amber font-sans text-[12px] px-3 py-2 mb-6">
            Your organizer account is pending admin approval. You can build drafts now, but publishing is locked until
            you&apos;re approved.
          </p>
        )}

        {tournaments.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <Stat gold value={tournaments.length} label="Total" />
            <Stat value={tournaments.filter((t) => t.status === "in_progress").length} label="Live" />
            <Stat value={tournaments.filter((t) => t.status === "registration_open").length} label="Open" />
            <Stat value={tournaments.filter((t) => t.status === "draft").length} label="Drafts" />
          </div>
        )}

        {tournaments.length === 0 ? (
          <Panel className="p-6 text-center">
            <p className="font-sans text-bk-body text-sm mb-4">No tournaments yet. Create your first one.</p>
            <ButtonLink href="/organizer/dashboard/tournaments/new">+ New tournament</ButtonLink>
          </Panel>
        ) : (
          <div className="flex flex-col gap-3">
            {tournaments.map((t) => {
              const st = STATUS[t.status] ?? { label: t.status, tone: "neutral" as const };
              return (
                <Link
                  key={t.id}
                  href={`/organizer/dashboard/tournaments/${t.id}`}
                  className="group block bg-bk-surface border border-bk-border p-4 transition-colors hover:border-bk-gold-from hover:bg-bk-surface-hover"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {t.competitiveTier && <TierBadge tier={t.competitiveTier} />}
                    <Badge tone={st.tone} className="ml-auto">
                      {st.label}
                    </Badge>
                  </div>
                  <p className="font-sans font-bold text-bk-heading text-base break-words group-hover:text-bk-gold-light">
                    {t.name}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-1">
                    <p className="font-sans text-bk-muted text-xs">{t.game.name}</p>
                    <p className="font-mono text-bk-body text-xs">
                      {t._count.registrations}/{t.maxTeams} registered · {t.startAt ? <LocalDate iso={t.startAt.toISOString()} /> : "TBA"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <AdSlot placement="dashboard" />
      </main>
    </>
  );
}
