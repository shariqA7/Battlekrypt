import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClubByUserId, getLatestRejectionReason } from "@/lib/services/clubs";
import { prisma } from "@/lib/prisma";
import { getClubLimits } from "@/lib/club-limits";
import { getClubRoster, listClubInvites } from "@/lib/services/club-roster";
import ResubmitForm from "./ResubmitForm";
import RosterManager from "./RosterManager";

export default async function ClubDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/club/dashboard");

  const club = await getClubByUserId(user.id);
  if (!club) redirect("/club/register");

  const rejectionReason =
    club.status === "rejected" ? await getLatestRejectionReason(club.id) : null;

  // Roster data is only loaded (and only usable) once the club is approved.
  const approved = club.status === "approved";
  const [games, roster, invites] = approved
    ? await Promise.all([
        prisma.game.findMany({
          where: { isApproved: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        getClubRoster(club.id),
        listClubInvites(club.id),
      ])
    : [[], null, []];
  const limits = getClubLimits(club);

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-4 mb-6">
        {club.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={club.logoUrl}
            alt=""
            className="w-14 h-14 object-cover border border-bk-border"
          />
        )}
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading">
          {club.clubName}
        </h1>
      </div>

      {club.status === "pending" && (
        <div className="bg-bk-surface border border-bk-border p-4">
          <p className="font-sans font-medium text-sm text-bk-heading mb-1">
            Awaiting admin approval
          </p>
          <p className="font-sans text-[13px] text-bk-body">
            We&apos;re reviewing your payment proof. You&apos;ll be able to invite
            players and build your roster once your club is approved.
          </p>
        </div>
      )}

      {club.status === "rejected" && (
        <div className="bg-bk-surface border border-bk-live p-4">
          <p className="font-sans font-medium text-sm text-bk-live mb-1">
            Registration not approved
          </p>
          {rejectionReason && (
            <p className="font-sans text-[13px] text-bk-heading mb-3">
              {rejectionReason}
            </p>
          )}
          <p className="font-sans text-[13px] text-bk-body mb-3">
            Upload a new payment proof to send your club back for review.
          </p>
          <ResubmitForm />
        </div>
      )}

      {approved && roster && (
        <RosterManager
          games={games}
          limits={{
            isPaid: limits.isPaid,
            canSetCoach: limits.canSetCoach,
            canUseSubstitutes: limits.maxSubstitutesPerTeam > 0,
          }}
          initialRoster={roster}
          initialInvites={invites}
        />
      )}
    </main>
  );
}
