
import { getTournamentById } from "@/lib/services/tournaments";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import RoomReveal from "./RoomReveal";
import FlagButton from "./FlagButton";
import { notFound } from "next/navigation";

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tournament = await getTournamentById(id);

  if (!tournament) notFound();

  return (
    <>

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
            <p className="font-sans text-bk-muted text-sm flex items-center gap-1.5">
              Hosted by{" "}
              <a href={`/organizers/${tournament.organizer.id}`} className="underline">
                {tournament.organizer.orgName}
              </a>
              <VerifiedBadge size={13} />
            </p>
          </div>
          <a
            href={`/tournaments/${tournament.id}/join`}
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
                ? `${tournament.prizePoolCurrency} ${tournament.prizePoolAmount.toString()}`
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
                : `${tournament.entryFeeCurrency} ${tournament.entryFeeAmount?.toString()}`}
            </p>
          </div>
        </div>

        <RoomReveal stages={tournament.stages} />

        {tournament.rules.length > 0 && (
          <>
            <p className="font-sans font-medium text-bk-heading text-sm mb-2">
              Rules
            </p>
            <div className="flex flex-col gap-1.5 mb-6">
              {tournament.rules.map((rule) => (
                <div key={rule.id} className="bg-bk-surface p-2.5 text-bk-body text-xs font-sans">
                  {rule.description}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-8">
          <FlagButton tournamentId={tournament.id} />
        </div>
      </main>
    </>
  );
}
