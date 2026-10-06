import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { checkInCounts } from "@/lib/services/venue";
import { listRegistrations, getTournamentById, getTournamentCapacity } from "@/lib/services/tournaments";
import { redirect, notFound } from "next/navigation";
import RegistrationQueue from "./RegistrationQueue";
import StageManager from "./StageManager";
import RulesManager from "./RulesManager";
import PublishButton from "./PublishButton";
import CancelButton from "./CancelButton";
import SaveAsTemplateButton from "./SaveAsTemplateButton";
import PayoutButton from "./PayoutButton";

export default async function ManageTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const result = await listRegistrations(id, organizerProfile.id);
  if ("error" in result) {
    // Ownership was already verified above, so this should be unreachable —
    // but redirecting gracefully is safer than crashing if it ever happens.
    redirect("/organizer/dashboard");
  }
  const registrations = result.data;
  const capacity = await getTournamentCapacity(id);
  const isLan = tournament.venueType === "lan";
  const counts = isLan ? await checkInCounts(id) : null;

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

        {isLan ? (
          <p className="font-sans text-[12px] text-bk-muted mb-2">
            LAN event: no room credentials. Use the check-in buttons below once players arrive.
          </p>
        ) : (
          <StageManager tournamentId={id} initialStages={tournament.stages} />
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
        <RegistrationQueue
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
