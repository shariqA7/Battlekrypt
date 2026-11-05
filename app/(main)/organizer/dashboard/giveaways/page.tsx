import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getGiveawayStatsFor, getOrganizerGiveawayStatus, listGiveawaysForOrganizer } from "@/lib/services/giveaways";
import { giveawayMessage } from "@/lib/giveaway-http";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import FeatureOffNotice from "@/components/ui/FeatureOffNotice";
import { SectionHeading } from "@/components/ui/Panel";
import GiveawayForm from "@/components/giveaways/GiveawayForm";
import GiveawayManager from "@/components/giveaways/GiveawayManager";

export default async function OrganizerGiveawaysPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/dashboard/giveaways");
  const org = await prisma.organizerProfile.findUnique({ where: { userId: user.id } });
  if (!org) redirect("/organizer/register");

  if (!(await getFeatureFlags()).giveaways) return <FeatureOffNotice title="Giveaways are switched off">Giveaways aren&apos;t available right now.</FeatureOffNotice>;

  const [items, status, stats, tournaments] = await Promise.all([
    listGiveawaysForOrganizer(org.id),
    getOrganizerGiveawayStatus(org.id),
    getGiveawayStatsFor(org.id),
    prisma.tournament.findMany({ where: { organizerId: org.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, name: true } }),
  ]);
  const blocked = (status?.blockers.length ?? 0) > 0;

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
      <Link href="/organizer/dashboard" className="font-sans text-[12px] text-bk-gold-light hover:underline">← Dashboard</Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 mb-2">
        <SectionHeading>Giveaways</SectionHeading>
        {!blocked && status && <GiveawayForm mode="organizer" ownTournaments={tournaments} defaultVerifiedOnly={status.defaultVerifiedOnly} reviewAboveUsd={status.reviewAboveUsd} />}
      </div>
      <p className="font-sans text-bk-body text-[13px] mb-6 pl-[19px]">
        Give something to your community. Players enter, you draw the winners at random, then send the prize and they confirm.
      </p>

      {status && (
        <div className="bg-bk-surface border border-bk-border px-4 py-3 mb-6 font-sans text-[13px]">
          <p className="text-bk-heading">
            {status.planName} plan: {status.limit === null ? "unlimited giveaways" : `${status.used} of ${status.limit} giveaway${status.limit === 1 ? "" : "s"} used this month`}
          </p>
          {blocked ? (
            <ul className="mt-2 space-y-1 text-bk-live text-[12px]" aria-label="Why you can't start one right now">
              {status.blockers.map((b) => <li key={b}>{giveawayMessage(b)}</li>)}
            </ul>
          ) : (
            <p className="text-bk-muted text-[12px] mt-1">{status.defaultVerifiedOnly ? "Only verified members (on a paid plan) can enter right now." : "Anyone can enter."} Prizes worth more than ${status.reviewAboveUsd} are checked by an admin first.</p>
          )}
        </div>
      )}

      {stats.total > 0 && (
        <p className="font-sans text-[12px] text-bk-muted mb-4">
          {stats.total} giveaway{stats.total === 1 ? "" : "s"} · {stats.entries} entries · {stats.confirmed} of {stats.winners} winners confirmed{stats.confirmationRate !== null && ` (${stats.confirmationRate}%)`}. Players see how reliably you deliver.
        </p>
      )}
      <GiveawayManager items={items} mode="organizer" />
    </main>
  );
}
