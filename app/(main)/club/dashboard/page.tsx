import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getClubByUserId,
  getClubPaymentInstructions,
  getLatestRejectionReason,
} from "@/lib/services/clubs";
import { prisma } from "@/lib/prisma";
import { getClubLimits } from "@/lib/club-limits";
import { getClubRoster, listClubInvites } from "@/lib/services/club-roster";
import UpgradeForm from "./UpgradeForm";
import RosterManager from "./RosterManager";

import AdSlot from "@/components/ui/AdSlot";
import DashboardTop from "@/components/dashboard/DashboardTop";
export default async function ClubDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/club/dashboard");

  const club = await getClubByUserId(user.id);
  if (!club) redirect("/club/register");

  const rejectionReason =
    club.upgradeStatus === "rejected" ? await getLatestRejectionReason(club.id) : null;

  // Clubs are active from the moment they're created; only a disbanded club
  // (after an upheld name claim) is shut down.
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
  const limits = await getClubLimits(club);

  return (
    <>
      <div className="w-full max-w-5xl mx-auto px-6 pt-8">
        <DashboardTop />
      </div>
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

      {club.status === "disbanded" && (
        <div className="bg-bk-surface border border-bk-live p-4">
          <p className="font-sans font-medium text-sm text-bk-live mb-1">
            This club was disbanded
          </p>
          <p className="font-sans text-[13px] text-bk-body">
            An admin upheld a claim that this club&apos;s name belongs to someone
            else. The roster has been released and the club can no longer be used.
          </p>
          <Link
            href="/club/register"
            className="inline-block mt-3 font-sans text-[12px] text-bk-gold-light underline"
          >
            Create a new club with a different name
          </Link>
        </div>
      )}

      {approved && !limits.isPaid && (
        <div className="bg-bk-surface border border-bk-border p-4 mb-6">
          <p className="font-sans font-medium text-sm text-bk-heading mb-1">
            Free plan
          </p>
          {club.upgradeStatus === "pending" ? (
            <p className="font-sans text-[13px] text-bk-body">
              Your payment is being reviewed. Paid-plan features unlock once an
              admin confirms it.
            </p>
          ) : (
            <>
              <p className="font-sans text-[13px] text-bk-body mb-3">
                Upgrade to the paid plan for unlimited entries, substitutes and a
                coach.
              </p>
              {club.upgradeStatus === "rejected" && (
                <p className="font-sans text-[13px] text-bk-live mb-3">
                  Your last payment wasn&apos;t accepted
                  {rejectionReason ? `: ${rejectionReason}` : "."} Send a new proof
                  below.
                </p>
              )}
              <UpgradeForm paymentInstructions={await getClubPaymentInstructions()} />
            </>
          )}
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
      <AdSlot placement="dashboard" />
    </main>
    </>
  );
}
