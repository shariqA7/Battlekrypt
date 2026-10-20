import { gameVisibilityWhere } from "@/lib/game-region";
import { getViewerRegion } from "@/lib/services/viewer-region";
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
import InitialTile from "@/components/ui/InitialTile";
import Stat from "@/components/ui/Stat";
import { Badge } from "@/components/ui/Badge";
import { Panel, SectionHeading } from "@/components/ui/Panel";
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
  const region = await getViewerRegion();
  const [games, roster, invites] = approved
    ? await Promise.all([
        prisma.game.findMany({
          where: { isApproved: true, ...(region.showAll ? {} : gameVisibilityWhere(region.country)) },
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
      <div className="w-full max-w-5xl mx-auto px-5 sm:px-6 pt-8">
        <DashboardTop />
      </div>
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <InitialTile name={club.clubName} size={56} src={club.logoUrl} />
        <div className="min-w-0">
          <SectionHeading className="!text-[22px] sm:!text-[26px] break-words">{club.clubName}</SectionHeading>
        </div>
        {approved && (
          <Badge tone={limits.isPaid ? "tier" : "neutral"} className="sm:ml-auto">
            {limits.isPaid ? "Paid plan" : "Free plan"}
          </Badge>
        )}
      </div>

      {approved && roster && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          <Stat gold value={roster.teams.length} label="Teams" />
          <Stat value={roster.soloPlayers.length} label="Solo players" />
          <Stat
            value={roster.teams.reduce((n, t) => n + t.members.length, 0) + roster.soloPlayers.length}
            label="Players"
            className="col-span-2 sm:col-span-1"
          />
        </div>
      )}

      {club.status === "disbanded" && (
        <div className="bg-bk-surface border border-bk-live p-4 mb-6">
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
        <Panel className="p-4 mb-8">
          <p className="font-sans font-bold text-base text-bk-heading mb-1">
            Upgrade your club
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
        </Panel>
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
