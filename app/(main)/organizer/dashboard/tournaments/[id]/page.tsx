import ChangeRequestPanel from "./ChangeRequestPanel";
import AwardWinnersPanel from "./AwardWinnersPanel";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import { listEligiblePlayers } from "@/lib/services/award-winners";
import { getLockState, listChangeRequestsFor } from "@/lib/services/change-requests";
import { conditionsToLines } from "@/lib/entry-conditions";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { checkInCounts } from "@/lib/services/venue";
import { listRegistrations, getTournamentById, getTournamentCapacity } from "@/lib/services/tournaments";
import { redirect, notFound } from "next/navigation";
import RegistrationQueue from "./RegistrationQueue";
import { consentStatusesForTournament } from "@/lib/services/parental-consent";
import StageManager from "./StageManager";
import HybridStageManager from "./HybridStageManager";
import { listStageEntries } from "@/lib/services/stages";
import RulesManager from "./RulesManager";
import PublishButton from "./PublishButton";
import CancelButton from "./CancelButton";
import SaveAsTemplateButton from "./SaveAsTemplateButton";
import PayoutButton from "./PayoutButton";
import PrizePayees from "./PrizePayees";
import InstitutesPanel from "@/components/institutes/InstitutesPanel";
import NoShowPolicyPanel from "@/components/penalties/NoShowPolicyPanel";
import { ButtonLink } from "@/components/ui/Button";
import { Badge, TierBadge } from "@/components/ui/Badge";
import Stat from "@/components/ui/Stat";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import { listTournamentInstitutions, getInstitutionUsage } from "@/lib/services/institutions";

const STATUS_TONE: Record<string, "teal" | "amber" | "danger" | "neutral" | "live"> = {
  draft: "neutral",
  published: "neutral",
  registration_open: "teal",
  registration_closed: "amber",
  in_progress: "live",
  completed: "neutral",
  cancelled: "danger",
};

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
  const [lock, changeRequests, flags] = await Promise.all([getLockState(id), listChangeRequestsFor(id), getFeatureFlags()]);
  const refundsDue = tournament.status === "cancelled" && tournament.cancelRefundsDueAt && !tournament.refundsConfirmedAt;
  const payoutRows =
    tournament.status === "completed"
      ? await prisma.prizePayout.findMany({ where: { tournamentId: id }, select: { status: true } })
      : [];
  // Parental consent status per registration (null when this tournament doesn't ask for it).
  const consentStatuses = await consentStatusesForTournament(id);
  const capacity = await getTournamentCapacity(id);
  const myInstitutionId =
    (await prisma.institution.findUnique({ where: { organizerId: organizerProfile.id }, select: { id: true } }))?.id ?? null;
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
      <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
        <ButtonLink href="/organizer/dashboard" variant="ghost" size="sm" className="mb-3 -ml-3">
          ← Dashboard
        </ButtonLink>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {tournament.competitiveTier && <TierBadge tier={tournament.competitiveTier} />}
          <Badge tone={STATUS_TONE[tournament.status] ?? "neutral"}>{tournament.status.replace(/_/g, " ")}</Badge>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
          <SectionHeading className="!text-[22px] sm:!text-[26px] break-words min-w-0 flex-1">
            {tournament.name}
          </SectionHeading>
          <PublishButton
            tournamentId={id}
            status={tournament.status}
            submittedForReview={tournament.submittedForReview}
            hasPrize={tournament.prizePoolAmount != null && Number(tournament.prizePoolAmount) > 0 && flags.tournamentLock}
          />
        </div>
        <p className="font-sans text-bk-body text-sm mb-5 pl-[19px]">Manage registrations and match rooms</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <Stat gold value={registrations.length} label="Registrations" />
          <Stat
            value={capacity ? `${capacity.filled}/${capacity.maxTeams}` : "—"}
            label="Slots filled"
          />
          <Stat value={registrations.filter((r) => r.status === "pending").length} label="Pending" className="col-span-2 sm:col-span-1" />
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-8">
          {tournament.status === "draft" && (
            <ButtonLink href={`/organizer/dashboard/tournaments/${id}/edit`} variant="outline" size="sm">
              Edit tournament
            </ButtonLink>
          )}
          <SaveAsTemplateButton tournamentId={id} />
          <PayoutButton
            tournamentId={id}
            status={tournament.status}
            hasPrizePool={!!tournament.prizePoolAmount || tournament.prizeAwards.length > 0}
            payoutConfirmed={tournament.payoutConfirmed}
          />
          <CancelButton tournamentId={id} status={tournament.status} />
        </div>

        {tournament.prizePoolAmount && ["in_progress", "completed"].includes(tournament.status) && (
          <PrizePayees tournamentId={id} />
        )}

        {(lock?.locked || changeRequests.length > 0 || refundsDue) && (
          <ChangeRequestPanel
            tournamentId={id}
            locked={Boolean(lock?.locked) && tournament.status !== "cancelled" && tournament.status !== "completed"}
            hasPrize={tournament.prizePoolAmount != null && Number(tournament.prizePoolAmount) > 0}
            prizeCurrency={tournament.prizePoolCurrency ?? "PKR"}
            currentPool={tournament.prizePoolAmount != null ? Number(tournament.prizePoolAmount) : 0}
            currentTiers={tournament.prizeTiers.map((t) => ({ positionFrom: t.positionFrom, positionTo: t.positionTo, amount: Number(t.amount) }))}
            currentAwards={tournament.prizeAwards.map((a) => ({ name: a.name, cashAmount: a.cashAmount == null ? null : Number(a.cashAmount), prizeText: a.prizeText }))}
            currentConditions={conditionsToLines(tournament.customFields)}
            requests={changeRequests.map((r) => ({
              id: r.id,
              kind: r.kind,
              details: r.details,
              status: r.status,
              adminNote: r.adminNote,
              createdAt: r.createdAt.toISOString(),
            }))}
            refundsDueAt={refundsDue && tournament.cancelRefundsDueAt ? tournament.cancelRefundsDueAt.toISOString() : null}
            flags={flags}
          />
        )}

        {tournament.status === "completed" && tournament.prizeAwards.length > 0 && (
          <AwardWinnersPanel
            tournamentId={id}
            awards={tournament.prizeAwards.map((a) => ({
              id: a.id,
              name: a.name,
              cash: a.cashAmount == null ? null : Number(a.cashAmount),
              text: a.prizeText,
              winnerUserId: a.winnerUserId,
              locked: tournament.payoutConfirmed,
            }))}
            players={await listEligiblePlayers(id)}
            currency={tournament.prizePoolCurrency ?? ""}
          />
        )}

        {payoutRows.length > 0 && (
          <p className="font-sans text-[12px] text-bk-body mb-6">
            Prize payouts: {payoutRows.filter((r) => r.status === "confirmed").length} of {payoutRows.length} winners confirmed
            {payoutRows.some((r) => r.status === "disputed") && (
              <span className="text-bk-live"> · {payoutRows.filter((r) => r.status === "disputed").length} reported as not paid</span>
            )}
            . Every winner confirming counts toward lifting your new-organizer limits.
          </p>
)}

        {isLan && counts && (
          <Panel className="mb-8 p-4">
            <p className="font-sans font-bold text-bk-heading text-base mb-1">LAN check-in</p>
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
          </Panel>
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
            endpoint={`/api/tournaments/${id}/institutions`}
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

        <p className="font-sans font-bold text-bk-heading text-base mt-10 mb-3">Rules</p>
        <RulesManager
          tournamentId={id}
          gameId={tournament.gameId}
          initialRules={tournament.rules}
          locked={!["draft", "published", "registration_open"].includes(tournament.status)}
        />

        <NoShowPolicyPanel
          tournamentId={id}
          initial={{ penalty: tournament.noShowPenalty, points: tournament.noShowPenaltyPoints }}
        />

        <div className="flex flex-wrap items-baseline justify-between gap-2 mt-10 mb-3">
          <p className="font-sans font-bold text-bk-heading text-base">
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
            <ButtonLink href={`/organizer/dashboard/tournaments/${id}?view=all`} size="sm" variant={view === "all" ? "outline" : "ghost"}>
              All requests
            </ButtonLink>
            <ButtonLink href={`/organizer/dashboard/tournaments/${id}?view=mine`} size="sm" variant={view === "mine" ? "outline" : "ghost"}>
              My requests
            </ButtonLink>
          </div>
        )}
        <RegistrationQueue
          key={`${view}:${registrations.map((r) => `${r.id}.${r.status}.${r.penalties.map((p) => p.id).join("+")}`).join("|")}`}
          tournamentId={id}
          initialRegistrations={registrations}
          mode={tournament.mode}
          isLan={isLan}
          rules={tournament.rules.map((r) => ({ id: r.id, title: r.title, description: r.description }))}
          consent={consentStatuses}
          noShowPolicy={{ penalty: tournament.noShowPenalty, points: tournament.noShowPenaltyPoints }}
          myInstitutionId={myInstitutionId}
        />
      </main>
    </>
  );
}
