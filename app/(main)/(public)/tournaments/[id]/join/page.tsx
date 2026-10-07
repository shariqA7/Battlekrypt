import { getTournamentById } from "@/lib/services/tournaments";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import JoinForm from "./JoinForm";
import ClubEntryPanel from "./ClubEntryPanel";
import { prisma } from "@/lib/prisma";
import { isPlayerInstitutionVerified } from "@/lib/services/institutions";
import { toPublicTournament } from "@/lib/services/venue";

export default async function JoinTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirectTo=/tournaments/${id}/join`);

  const full = await getTournamentById(id);
  if (!full) notFound();
  // This object is passed into a client component, so strip secrets first.
  const tournament = toPublicTournament(full);

  // Institution-only: self-registration needs an approved verification. The
  // block links to the profile page and brings the player straight back.
  let needsVerification = false;
  if (tournament.audienceScope === "institution") {
    const player = await prisma.playerProfile.findUnique({ where: { userId: user.id } });
    needsVerification = !player || !(await isPlayerInstitutionVerified(player.id));
  }

  return (
    <>
      <main className="flex-1 px-6 py-10 max-w-lg mx-auto w-full">
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">
          Join {tournament.name}
        </h1>
        <p className="font-sans text-bk-body text-sm mb-6">
          {tournament.entryType === "paid"
            ? `Entry fee: ${
                tournament.entryFeeAmount
                  ? formatMoney(tournament.entryFeeAmount, tournament.entryFeeCurrency ?? "PKR")
                  : "—"
              }`
            : "Free entry"}
        </p>
        {tournament.audienceScope === "institution" && (
          <p className="font-sans text-[11px] uppercase tracking-[0.5px] text-bk-gold-light mb-4">
            Students only
          </p>
        )}
        <ClubEntryPanel tournamentId={tournament.id} />
        {needsVerification ? (
          <div className="border border-bk-gold-light/40 bg-bk-bg px-4 py-4 mt-4">
            <p className="font-sans text-[13px] text-bk-heading font-bold mb-1">
              Verify your institution to join
            </p>
            <p className="font-sans text-[12px] text-bk-muted mb-3">
              This tournament is for verified students. It only takes one ID photo, and you won&apos;t
              need to do it again for other student tournaments.
            </p>
            <a
              href={`/dashboard/profile?next=${encodeURIComponent(`/tournaments/${tournament.slug}/join`)}`}
              className="block sm:inline-block text-center bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-5 py-3"
            >
              Verify now
            </a>
          </div>
        ) : (
          <JoinForm
            tournamentId={tournament.id}
            tournament={tournament}
            userId={user.id}
          />
        )}
      </main>
    </>
  );
}
