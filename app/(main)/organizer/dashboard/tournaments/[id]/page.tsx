import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { checkInCounts } from "@/lib/services/venue";
import { listRegistrations, getTournamentById, getTournamentCapacity } from "@/lib/services/tournaments";
import { redirect, notFound } from "next/navigation";
import RegistrationQueue from "./RegistrationQueue";
import StageManager from "./StageManager";
import HybridStageManager from "./HybridStageManager";
import { listStageEntries } from "@/lib/services/stages";
import RulesManager from "./RulesManager";
import PublishButton from "./PublishButton";
import CancelButton from "./CancelButton";
import SaveAsTemplateButton from "./SaveAsTemplateButton";
import PayoutButton from "./PayoutButton";
import InstitutesPanel from "./InstitutesPanel";
import { listTournamentInstitutions, getInstitutionUsage } from "@/lib/services/institutions";

export default async function ManageTournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view: viewParam } = await searchParams;
  // "mine" = entries the host handles itself; "all" also includes co-host queues.
  const view = viewParam === "mine" ? "mine" : "all";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirectTo=/organizer/dashboard/tournaments/${id}`);

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!organizerProfile) redirect("/organizer/onboard");

  const tournament = await getTournamentById(id);
  if (!tournament) notFound();
  if (tournament.organizerId !== organizerProfile.id) redirect("/organizer/dashboard");

  const result = await listRegistrations(id, organizerProfile.id, undefined, view);
  if ("error" in result) {
    // Ownership was already verified above, so this should be unreachable —
    // but redirecting gracefully is safer than crashing if it ever happens.
    redirect("/organizer/dashboard");
  }
  const registrations = result.data;
  const capacity = await getTournamentCapacity(id);
  const isInstitutionScoped = tournament.audienceScope === "institution";
  const linkedInstitutes = isInstitutionScoped ? await listTournamentInstitutions(id) : [];
  const instituteUsage = isInstitutionScoped ? await getInstitutionUsage(id) : {};
  const hostInstitute = isInstitutionScoped
    ? await prisma.institution.findUnique({ where: { organizerId: organizerProfile.id }, select: { id: true, name: true, verified: true } })
    : null;
  const isLan = tournament.venueType === "lan";
  const isHybrid = tournament.venueType === "hybrid";
  const counts = isLan ? await checkInCounts(id) : null;
  const stageEntries = isHybrid ? await listStageEntries(id) : [];
  const entrants = registrations
    .filter((r) => r.status === "approved")
    .map((r) => ({
      id: r.id,
      status: r.status,
      points: r.points,
      name: r.teamEntry?.name ?? r.player?.user.displayName ?? "Unknown",
    }));

  return (
    <>
      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <div className="flex justify-between items-start mb-1">
          <h1 className="font-sans font-extrabold text-2xl text-bk-heading">
            {tournament.name}
          </h1>
          <PublishButton
            tournamentId={id}
            status={tournament.status}
            submittedForReview={tournament.submittedForReview}
          />
        </div>
        <p className="font-sans text-bk-body text-sm mb-3">
          Manage registrations and match rooms
        </p>
        <div className="flex items-center gap-4 mb-8">
          {tournament.status === "draft" && (
            <a
              href={`/organizer/dashboard/tournaments/${id}/edit`}
              className="text-bk-gold-light font-sans text-[11px] uppercase tracking-[0.5px] underline"
            >
              Edit tournament
            </a>
          )}
          <CancelButton tournamentId={id} status={tournament.status} />
          <SaveAsTemplateButton tournamentId={id} />
          <PayoutButton
            tournamentId={id}
            status={tournament.status}
            hasPrizePool={!!tournament.prizePoolAmount}
            payoutConfirmed={tournament.payoutConfirmed}
          />
        </div>

        {isLan && counts && (
          <div className="mb-8 border border-bk-border bg-bk-surface p-4">
            <p className="font-sans font-medium text-bk-heading text-sm mb-1">LAN check-in</p>
            <p className="font-sans text-[12px] text-bk-muted mb-3 break-words">
              {tournament.venueName} · {tournament.venueAddress}, {tournament.venueCity}
            </p>
            <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted">
              Check-in code (show it at the venue desk — don&apos;t post it online)
            </p>
            <p className="font-mono text-bk-gold-light text-3xl tracking-[4px] my-1">
              {tournament.checkInCode}
            </p>
            <p className="font-sans text-[12px] text-bk-body">
              {counts.checkedIn} checked in · {counts.noShow} no-show · {counts.pending} waiting
            </p>
          </div>
        )}

        {isHybrid ? (
          <HybridStageManager
            tournamentId={id}
            stages={tournament.stages}
            entrants={entrants}
            entries={stageEntries}
          />
        ) : isLan ? (
          <p className="font-sans text-[12px] text-bk-muted mb-2">
            LAN event: no room credentials. Use the check-in buttons below once players arrive.
          </p>
        ) : (
          <StageManager tournamentId={id} initialStages={tournament.stages} />
        )}

        {isInstitutionScoped && (
          <InstitutesPanel
            tournamentId={id}
            hostInstitute={hostInstitute}
            defaultLimit={tournament.maxEntriesPerInstitute}
            usage={instituteUsage}
            hostInstituteId={hostInstitute?.id ?? null}
            initial={linkedInstitutes.map((l) => ({
              institutionId: l.institutionId,
              name: l.institution.name,
              role: l.role,
              status: l.status,
              maxEntries: l.maxEntries,
            }))}
          />
        )}

        <p className="font-sans font-medium text-bk-heading text-sm mt-10 mb-3">Rules</p>
        <RulesManager
          tournamentId={id}
          gameId={tournament.gameId}
          initialRules={tournament.rules}
          locked={!["draft", "published", "registration_open"].includes(tournament.status)}
        />

        <div className="flex items-baseline justify-between mt-10 mb-3">
          <p className="font-sans font-medium text-bk-heading text-sm">
            Registrations ({registrations.length})
          </p>
          {capacity && (
            <p className="font-sans text-bk-muted text-xs">
              {capacity.filled} / {capacity.maxTeams} slots filled
              {capacity.open > 0 && ` · ${capacity.open} open`}
            </p>
          )}
        </div>
        {isInstitutionScoped && linkedInstitutes.some((l) => l.role === "cohost" && l.status === "accepted") && (
          <div className="flex gap-2 mb-3 font-sans text-[12px]">
            <a
              href={`/organizer/dashboard/tournaments/${id}?view=all`}
              className={`px-3 py-1.5 border ${view === "all" ? "border-bk-gold-light text-bk-gold-light" : "border-bk-border text-bk-muted"}`}
            >
              All requests
            </a>
            <a
              href={`/organizer/dashboard/tournaments/${id}?view=mine`}
              className={`px-3 py-1.5 border ${view === "mine" ? "border-bk-gold-light text-bk-gold-light" : "border-bk-border text-bk-muted"}`}
            >
              My requests
            </a>
          </div>
        )}
        <RegistrationQueue
          key={view}
          tournamentId={id}
          initialRegistrations={registrations}
          mode={tournament.mode}
          isLan={isLan}
          rules={tournament.rules.map((r) => ({ id: r.id, title: r.title, description: r.description }))}
        />
      </main>
    </>
  );
}
