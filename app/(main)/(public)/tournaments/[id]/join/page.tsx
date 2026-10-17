import { getTournamentById } from "@/lib/services/tournaments";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import JoinForm from "./JoinForm";
import ConsentPanel from "@/components/consent/ConsentPanel";
import { parentalConsentEnabled } from "@/lib/consent-config";
import { consentNeeded } from "@/lib/consent";
import { getConsentStateForPlayer } from "@/lib/services/parental-consent";
import ClubEntryPanel from "./ClubEntryPanel";
import { prisma } from "@/lib/prisma";
import { checkInstitutionGate } from "@/lib/services/institutions";
import { toPublicTournament } from "@/lib/services/venue";
import { getStudentId } from "@/lib/services/student-id";
import { isUsableStudentId } from "@/lib/student-id-status";

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

  // Institution-only: the player's institute must be one taking part. If not,
  // the block links to the profile page (pick/change institute) and brings the
  // player straight back.
  // Under-18 players need a guardian's consent when this tournament asks for it.
  // They can still register; room details and check-in unlock after approval.
  let consent: Awaited<ReturnType<typeof getConsentStateForPlayer>> | null = null;
  if (parentalConsentEnabled() && full.requireParentalConsent) {
    const me = await prisma.playerProfile.findUnique({ where: { userId: user.id }, select: { id: true, birthDate: true } });
    if (me && consentNeeded(full, me.birthDate, true)) consent = await getConsentStateForPlayer(me.id);
  }

  let needsVerification = false;
  if (tournament.audienceScope === "institution") {
    const player = await prisma.playerProfile.findUnique({ where: { userId: user.id } });
    needsVerification =
      !player ||
      "error" in (await checkInstitutionGate(full.id, [player.id], { skipProof: true, selfPlayerId: player.id }));
  }

  // The tournament asks for a student ID: the one stored on the player's profile
  // is attached automatically. If it's missing or expired, send them to add it.
  const idRequired = tournament.audienceScope === "institution" && full.requireFreshInstitutionProof;
  const storedId = idRequired && !needsVerification ? await getStudentId(user.id) : null;
  const idUsable = !idRequired || needsVerification || (storedId ? isUsableStudentId(storedId.status) : false);
  const profileLink = `/dashboard/profile?next=${encodeURIComponent(`/tournaments/${tournament.slug}/join`)}`;

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
            Participating institutes only
          </p>
        )}
        {consent && (
          <div className="mb-4">
            <ConsentPanel
              state={consent.state}
              validUntil={consent.validUntil?.toISOString() ?? null}
              guardianEmailMasked={consent.guardianEmailMasked}
              requestedFor={tournament.name}
            />
          </div>
        )}
        <ClubEntryPanel tournamentId={tournament.id} />
        {needsVerification ? (
          <div className="border border-bk-gold-light/40 bg-bk-bg px-4 py-4 mt-4">
            <p className="font-sans text-[13px] text-bk-heading font-bold mb-1">
              Your institute can&apos;t join yet
            </p>
            <p className="font-sans text-[12px] text-bk-muted mb-3">
              This tournament is only open to players from the participating institutes. Check
              that you&apos;ve selected your institute in your profile.
            </p>
            <a
              href={`/dashboard/profile?next=${encodeURIComponent(`/tournaments/${tournament.slug}/join`)}`}
              className="block sm:inline-block text-center bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-5 py-3"
            >
              Open profile
            </a>
          </div>
        ) : !idUsable ? (
          <div className="border border-bk-gold-light/40 bg-bk-bg px-4 py-4 mt-4">
            <p className="font-sans text-[13px] text-bk-heading font-bold mb-1">
              {storedId?.status === "expired" ? "Your student ID has expired" : "This tournament needs your student ID"}
            </p>
            <p className="font-sans text-[12px] text-bk-muted mb-3">
              {storedId?.status === "expired"
                ? `It expired on ${storedId.expiresAt?.toISOString().slice(0, 10)}. Add your new ID and you'll come straight back here.`
                : storedId?.status === "other_institute"
                  ? "Your stored ID is from your previous institute. Add your current one and you'll come straight back here."
                  : "Add it once in your profile. It's then used for every tournament that asks for one, until it expires."}
            </p>
            <a
              href={profileLink}
              className="block sm:inline-block text-center bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-5 py-3"
            >
              {storedId?.status === "expired" || storedId?.status === "other_institute" ? "Add my new student ID" : "Add my student ID"}
            </a>
          </div>
        ) : (
          <>
            {idRequired && storedId && (
              <p className="font-sans text-[12px] text-bk-muted mt-4">
                Your student ID{storedId.expiresAt ? ` (valid until ${storedId.expiresAt.toISOString().slice(0, 10)})` : ""} will
                be attached to your entry. The organizer can see it; nobody else can.
              </p>
            )}
            <JoinForm tournamentId={tournament.id} tournament={tournament} />
          </>
        )}
      </main>
    </>
  );
}
