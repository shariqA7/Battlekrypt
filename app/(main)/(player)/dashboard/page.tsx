import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getMyRegistrations } from "@/lib/services/tournaments";
import { listPlayerInvites, getPlayerMembership } from "@/lib/services/club-roster";
import ClubInvites from "./ClubInvites";
import Link from "next/link";
import { Badge, TierBadge } from "@/components/ui/Badge";
import InitialTile from "@/components/ui/InitialTile";
import LocalDate from "@/components/ui/LocalDate";
import Stat from "@/components/ui/Stat";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import { ButtonLink } from "@/components/ui/Button";
import { redirect } from "next/navigation";

import AdSlot from "@/components/ui/AdSlot";
import DashboardTop from "@/components/dashboard/DashboardTop";
const REG_STATUS: Record<string, { label: string; tone: "teal" | "amber" | "danger" }> = {
  pending: { label: "Pending approval", tone: "amber" },
  approved: { label: "Approved", tone: "teal" },
  rejected: { label: "Rejected", tone: "danger" },
  disqualified: { label: "Disqualified", tone: "danger" },
};

const PAYMENT_NOTE: Record<string, string> = {
  unpaid: "Payment not confirmed yet",
  paid: "Payment confirmed",
  waived: "Entry fee waived",
};

type Reg = Awaited<ReturnType<typeof getMyRegistrations>>[number];

function RegistrationCard({ r }: { r: Reg }) {
  const status = REG_STATUS[r.status];
  const t = r.tournament;
  const live = t.status === "in_progress";
  return (
    <Link
      href={`/tournaments/${t.slug}`}
      className="group block bg-bk-surface border border-bk-border p-4 transition-colors hover:border-bk-gold-from hover:bg-bk-surface-hover"
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {t.competitiveTier && <TierBadge tier={t.competitiveTier} />}
        {live && (
          <Badge tone="live">
            <span className="w-1.5 h-1.5 rounded-full bg-bk-teal" />
            Live
          </Badge>
        )}
        <Badge tone={status.tone} className="ml-auto">
          {status.label}
        </Badge>
      </div>
      <p className="font-sans font-bold text-bk-heading text-base break-words group-hover:text-bk-gold-light">{t.name}</p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-1">
        <p className="font-sans text-bk-muted text-xs">{t.game.name}</p>
        <p className="font-mono text-bk-body text-xs">
          {t.startAt ? <LocalDate iso={t.startAt.toISOString()} format="long" /> : "TBA"}
        </p>
      </div>
      {t.entryType === "paid" && r.status !== "rejected" && (
        <p className={`font-sans text-xs mt-2 ${r.paymentStatus === "unpaid" ? "text-bk-amber" : "text-bk-muted"}`}>
          {PAYMENT_NOTE[r.paymentStatus]}
        </p>
      )}
    </Link>
  );
}

export default async function PlayerDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/dashboard");

  const playerProfile = await prisma.playerProfile.findUnique({
    where: { userId: user.id },
    include: { user: { select: { displayName: true, avatarUrl: true } } },
  });

  const [registrations, clubInvites, clubMembership] = playerProfile
    ? await Promise.all([
        getMyRegistrations(playerProfile.id),
        listPlayerInvites(playerProfile.id),
        getPlayerMembership(playerProfile.id),
      ])
    : [[], [], null];

  const name = playerProfile?.user.displayName ?? `${playerProfile?.firstName ?? ""} ${playerProfile?.lastName ?? ""}`.trim();

  const isPast = (r: Reg) => r.tournament.status === "completed" || r.tournament.status === "cancelled";
  const current = registrations.filter((r) => !isPast(r));
  const past = registrations.filter(isPast);
  const approved = registrations.filter((r) => r.status === "approved").length;
  const pending = registrations.filter((r) => r.status === "pending").length;

  return (
    <>
      <div className="w-full max-w-5xl mx-auto px-5 sm:px-6 pt-8">
        <DashboardTop />
      </div>
      <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <InitialTile name={name || "?"} size={48} round src={playerProfile?.user.avatarUrl} />
            <SectionHeading className="!text-[22px] sm:!text-[26px]">My matches</SectionHeading>
          </div>
          <ButtonLink href="/dashboard/profile" variant="outline" size="sm">
            Profile settings
          </ButtonLink>
        </div>
        <p className="font-sans text-bk-body text-sm mb-6 pl-[19px]">Everything you&apos;ve registered for, in one place.</p>

        {registrations.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <Stat gold value={registrations.length} label="Joined" />
            <Stat value={approved} label="Approved" />
            <Stat value={pending} label="Pending" />
          </div>
        )}

        <ClubInvites membership={clubMembership} invites={clubInvites} />

        {registrations.length === 0 ? (
          <Panel className="p-6 text-center">
            <p className="font-sans text-bk-body text-sm mb-4">You haven&apos;t joined any tournaments yet.</p>
            <ButtonLink href="/tournaments">Browse tournaments</ButtonLink>
          </Panel>
        ) : (
          <>
            {current.length > 0 && (
              <div className="flex flex-col gap-3">
                {current.map((r) => (
                  <RegistrationCard key={r.id} r={r} />
                ))}
              </div>
            )}
            {past.length > 0 && (
              <>
                <p className="font-sans font-bold text-[11px] uppercase tracking-[1.6px] text-bk-muted mt-8 mb-3">Past tournaments</p>
                <div className="flex flex-col gap-3">
                  {past.map((r) => (
                    <RegistrationCard key={r.id} r={r} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
        <AdSlot placement="dashboard" />
      </main>
    </>
  );
}
