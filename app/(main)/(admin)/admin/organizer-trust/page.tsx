import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import { getTrustConfig, listDisputedPayouts, listOrganizersOnHold } from "@/lib/services/organizer-trust";
import { SectionHeading } from "@/components/ui/Panel";
import OrganizerTrustManager from "./OrganizerTrustManager";

export default async function AdminOrganizerTrustPage() {
  await requireAdminPage();
  const [cfg, holds, disputed, organizers] = await Promise.all([
    getTrustConfig(),
    listOrganizersOnHold(),
    listDisputedPayouts(),
    prisma.organizerProfile.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, orgName: true, limitsLifted: true, user: { select: { email: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Organizer trust</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          Starter limits for new organizers, and the hold on organizers with unsettled prize payouts. Entry fees and
          prizes are paid directly between people, so these records are claims, not verified payments.
        </p>
      </div>
      <OrganizerTrustManager
        config={{
          starterMaxEntryFeeUsd: Number(cfg.starterMaxEntryFeeUsd),
          starterMaxPrizeUsd: Number(cfg.starterMaxPrizeUsd),
          starterMaxPaidEntrants: cfg.starterMaxPaidEntrants,
          graduationEvents: cfg.graduationEvents,
          payoutGraceDays: cfg.payoutGraceDays,
          reportPauseThreshold: cfg.reportPauseThreshold,
          idRetentionDays: cfg.idRetentionDays,
          idRejectedRetentionDays: cfg.idRejectedRetentionDays,
          idValidityMonths: cfg.idValidityMonths,
        }}
        holds={holds.map((h) => ({
          id: h.id,
          orgName: h.orgName,
          email: h.user.email ?? "no email",
          items: h.holds.map((x) => ({ name: x.name, reason: x.reason })),
        }))}
        disputed={disputed.map((d) => ({
          id: d.id,
          tournament: d.tournament.name,
          organizer: d.tournament.organizer.orgName,
          organizerUserId: d.tournament.organizer.user.id,
          winner: d.registration?.teamEntry?.name ?? d.registration?.player?.user.displayName ?? d.recipientName ?? "Winner",
          amount: [Number(d.amount) > 0 ? `${Number(d.amount).toLocaleString()} ${d.currency}` : null, d.description]
            .filter(Boolean)
            .join(" + ") + (d.award ? ` (${d.award.name} award)` : ""),
          note: d.winnerNote,
        }))}
        organizers={organizers.map((o) => ({ id: o.id, orgName: o.orgName, email: o.user.email ?? "no email", limitsLifted: o.limitsLifted }))}
      />
    </div>
  );
}
