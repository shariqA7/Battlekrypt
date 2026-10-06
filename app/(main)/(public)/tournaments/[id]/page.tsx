import { getTournamentById, getStandings } from "@/lib/services/tournaments";
import { toPublicTournament } from "@/lib/services/venue";
import CheckInPanel from "./CheckInPanel";
import { formatMoney } from "@/lib/money";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import RoomReveal from "./RoomReveal";
import FlagButton from "./FlagButton";
import Standings from "./Standings";
import TrackView from "./TrackView";
import VoteWidget from "./VoteWidget";
import { notFound } from "next/navigation";

import AdSlot from "@/components/ui/AdSlot";
export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [full, standings] = await Promise.all([
    getTournamentById(id),
    getStandings(id),
  ]);

  if (!full) notFound();
  // Room credentials and the check-in code never reach the page: they are
  // served only through their own access-checked endpoints.
  const tournament = toPublicTournament(full);

  return (
    <>
      <TrackView tournamentId={tournament.id} />
      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <div className="h-[120px] bg-bk-surface mb-6 flex items-end p-3 relative">
          {tournament.status === "in_progress" && (
            <span className="bg-[rgba(239,68,68,0.15)] text-bk-live text-[11px] font-sans px-2 py-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-bk-live" />
              Live now
            </span>
          )}
          {tournament.competitiveTier !== "none" && (
            <span className="absolute top-3 right-3 bg-bk-gold-gradient text-bk-bg text-[10px] font-sans font-bold px-2 py-1">
              {tournament.competitiveTier.toUpperCase()}-TIER
            </span>
          )}
        </div>

        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="font-sans font-bold text-xl text-bk-heading mb-1">
              {tournament.name}
            </h1>
            {tournament.venueType === "lan" && (
              <p className="font-sans text-[11px] uppercase tracking-[0.5px] text-bk-gold-light mb-1">
                LAN · {tournament.venueCity}
              </p>
            )}
            {tournament.audienceScope === "institution" && (
              <p className="font-sans text-[11px] uppercase tracking-[0.5px] text-bk-gold-light mb-1">
                Students only · institution verification required
              </p>
            )}
            <p className="font-sans text-bk-muted text-sm flex items-center gap-1.5">
              Hosted by{" "}
              <a href={`/organizers/${tournament.organizer.id}`} className="underline">
                {tournament.organizer.orgName}
              </a>
              <VerifiedBadge size={13} />
            </p>
          </div>
          <a
            href={`/tournaments/${tournament.slug}/join`}
            className="bg-white text-bk-bg font-sans font-bold text-[13px] px-5 py-2.5 inline-block text-center"
          >
            Join tournament
          </a>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-bk-surface p-4">
            <p className="text-bk-muted text-[11px] font-sans mb-1">Prize pool</p>
            <p className="font-mono text-bk-gold-light text-lg">
              {tournament.prizePoolAmount
                ? formatMoney(tournament.prizePoolAmount, tournament.prizePoolCurrency ?? "PKR")
                : "—"}
            </p>
          </div>
          <div className="bg-bk-surface p-4">
            <p className="text-bk-muted text-[11px] font-sans mb-1">Teams</p>
            <p className="font-mono text-bk-heading text-lg">
              {tournament._count.registrations}/{tournament.maxTeams}
            </p>
          </div>
          <div className="bg-bk-surface p-4">
            <p className="text-bk-muted text-[11px] font-sans mb-1">Entry fee</p>
            <p className="font-mono text-bk-heading text-lg">
              {tournament.entryType === "free"
                ? "Free"
                : tournament.entryFeeAmount
                  ? formatMoney(tournament.entryFeeAmount, tournament.entryFeeCurrency ?? "PKR")
                  : "—"}
            </p>
          </div>
        </div>

        {tournament.venueType === "lan" ? (
          <>
            <div className="mb-6 border border-bk-border bg-bk-surface p-4">
              <p className="font-sans font-medium text-bk-heading text-sm mb-1">Venue (LAN)</p>
              <p className="font-sans text-[13px] text-bk-heading break-words">{tournament.venueName}</p>
              <p className="font-sans text-[12px] text-bk-muted break-words">
                {[tournament.venueAddress, tournament.venueCity].filter(Boolean).join(", ")}
              </p>
              <p className="font-sans text-[11px] text-bk-muted mt-2">
                No room code for this event: show up and check in at the venue.
              </p>
            </div>
            <CheckInPanel tournamentId={tournament.id} />
          </>
        ) : (
          <RoomReveal stages={tournament.stages} />
        )}

        {tournament.rules.length > 0 && (
          <>
            <p className="font-sans font-medium text-bk-heading text-sm mb-2">
              Rules
            </p>
            <div className="flex flex-col gap-1.5 mb-6">
              {tournament.rules.map((rule) => (
                <div key={rule.id} className="bg-bk-surface p-2.5 text-bk-body text-xs font-sans">
                  {rule.title && (
                    <p className="text-bk-heading text-[13px] mb-0.5">{rule.title}</p>
                  )}
                  <p>{rule.description}</p>
                  <p className="text-bk-gold-light text-[11px] mt-1">
                    {rule.action === "point_deduction"
                      ? `Point deduction${rule.penaltyPoints ? ` (−${rule.penaltyPoints} pt${rule.penaltyPoints === 1 ? "" : "s"})` : ""}`
                      : rule.action === "disqualification"
                        ? "Disqualification"
                        : "Warning"}
                    {rule.appliesToStage && ` · ${rule.appliesToStage.name} only`}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        <Standings standings={standings} />

        <div className="mt-8 flex items-center justify-between">
          <VoteWidget tournamentId={tournament.id} />
          <FlagButton tournamentId={tournament.id} />
        </div>
        <AdSlot placement="tournament_detail" />
      </main>
    </>
  );
}
