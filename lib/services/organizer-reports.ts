// Player reports against organizers.
//
// A player who took part in a staked (paid or prized) event can report its
// organizer. When enough DIFFERENT players report the same organizer within
// REPORT_WINDOW_DAYS, the organizer is paused: no new paid registrations and no
// new paid or prized events until an admin reviews. The platform never holds the
// money, so a report leads to a pause, a decision and optionally a ban (the
// existing ban tool), not a refund.
import { prisma } from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import { notify } from "@/lib/services/notifications";
import { REPORT_KINDS, type ReportKindT } from "@/lib/report-kinds";

export const REPORT_WINDOW_DAYS = 30;
export const REPORTS_PER_DAY = 5;
const DAY_MS = 86_400_000;

// Existing pauses stay in force even if the reports switch is later turned off:
// they protect players who are already involved.
export async function getOrganizerPause(organizerId: string) {
  const o = await prisma.organizerProfile.findUnique({
    where: { id: organizerId },
    select: { reportsPausedAt: true, reportsPauseReason: true },
  });
  return { paused: !!o?.reportsPausedAt, reason: o?.reportsPauseReason ?? null };
}

export async function fileReport(input: { userId: string; tournamentId: string; kind: ReportKindT; description: string }) {
  if (!(await getFeatureFlags()).playerReports) return { error: "feature_off" as const };
  const description = input.description.trim();
  if (description.length < 10 || description.length > 1500) {
    return { error: "validation_error" as const, message: "Describe what happened in 10–1500 characters." };
  }
  if (!REPORT_KINDS.includes(input.kind)) return { error: "validation_error" as const, message: "Choose what happened." };

  const t = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    select: { id: true, name: true, organizerId: true, entryType: true, prizePoolAmount: true, organizer: { select: { userId: true, orgName: true } } },
  });
  if (!t) return { error: "not_found" as const };
  if (t.organizer.userId === input.userId) return { error: "forbidden" as const };
  const staked = t.entryType === "paid" || (t.prizePoolAmount != null && Number(t.prizePoolAmount.toString()) > 0);
  if (!staked) return { error: "validation_error" as const, message: "Reports are for paid or prized events." };

  // Only people who actually took part can report (solo registrant or a team member).
  const took = await prisma.registration.count({
    where: {
      tournamentId: t.id,
      OR: [{ player: { userId: input.userId } }, { teamEntry: { members: { some: { player: { userId: input.userId } } } } }],
    },
  });
  if (took === 0) return { error: "forbidden" as const };

  const recent = await prisma.organizerReport.count({ where: { reporterUserId: input.userId, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
  if (recent >= REPORTS_PER_DAY) return { error: "rate_limited" as const };
  const dup = await prisma.organizerReport.findFirst({ where: { tournamentId: t.id, reporterUserId: input.userId, status: "open" } });
  if (dup) return { error: "already_reported" as const };

  const report = await prisma.organizerReport.create({
    data: { organizerId: t.organizerId, tournamentId: t.id, reporterUserId: input.userId, kind: input.kind, description },
  });

  // The breaker: distinct reporters recently (open or upheld reports count).
  const since = new Date(Date.now() - REPORT_WINDOW_DAYS * DAY_MS);
  const reporters = await prisma.organizerReport.findMany({
    where: { organizerId: t.organizerId, status: { in: ["open", "upheld"] }, createdAt: { gte: since } },
    distinct: ["reporterUserId"],
    select: { reporterUserId: true },
  });
  const cfg = await prisma.organizerTrustConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  const org = await prisma.organizerProfile.findUnique({ where: { id: t.organizerId }, select: { reportsPausedAt: true } });
  let paused = false;
  if (cfg.reportPauseThreshold > 0 && reporters.length >= cfg.reportPauseThreshold && !org?.reportsPausedAt) {
    await prisma.organizerProfile.update({
      where: { id: t.organizerId },
      data: { reportsPausedAt: new Date(), reportsPauseReason: `${reporters.length} players reported problems in the last ${REPORT_WINDOW_DAYS} days.` },
    });
    paused = true;
    await notify(t.organizer.userId, {
      type: "report",
      title: "Your paid events are paused",
      body: `Several players reported problems with your events, so new paid registrations and new paid or prized events are paused while an admin reviews. Contact support to resolve it.`,
      href: "/organizer/dashboard",
    });
  } else {
    await notify(t.organizer.userId, {
      type: "report",
      title: "A player reported a problem",
      body: `A player who took part in "${t.name}" reported a problem. Check that registrations, refunds and prizes are in order.`,
      href: "/organizer/dashboard",
    });
  }
  return { data: report, paused };
}

export async function listMyReports(userId: string) {
  return prisma.organizerReport.findMany({
    where: { reporterUserId: userId },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { tournament: { select: { name: true } }, organizer: { select: { orgName: true } } },
  });
}

export async function countOpenReports() {
  return prisma.organizerReport.count({ where: { status: "open" } });
}

export async function listReportsForAdmin() {
  const orgs = await prisma.organizerProfile.findMany({
    where: { OR: [{ reportsPausedAt: { not: null } }, { reports: { some: { status: "open" } } }] },
    select: {
      id: true, orgName: true, userId: true, reportsPausedAt: true, reportsPauseReason: true,
      user: { select: { email: true } },
      reports: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, kind: true, description: true, status: true, adminNote: true, createdAt: true, reporterUserId: true, tournament: { select: { name: true } } },
      },
    },
  });
  const ids = Array.from(new Set(orgs.flatMap((o) => o.reports.map((r) => r.reporterUserId))));
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
  const name = (id: string) => users.find((u) => u.id === id)?.displayName ?? "Unknown";
  return orgs
    .map((o) => ({ ...o, reports: o.reports.map((r) => ({ ...r, reporterName: name(r.reporterUserId) })) }))
    .sort((a, b) => Number(!!b.reportsPausedAt) - Number(!!a.reportsPausedAt) || b.reports.length - a.reports.length);
}

export async function decideReport(input: { adminId: string; reportId: string; outcome: "upheld" | "dismissed"; note: string }) {
  const note = input.note.trim();
  if (!note) return { error: "validation_error" as const, message: "Add a note explaining the decision." };
  const r = await prisma.organizerReport.findUnique({ where: { id: input.reportId }, include: { tournament: { select: { name: true } } } });
  if (!r) return { error: "not_found" as const };
  if (r.status !== "open") return { error: "validation_error" as const, message: "Already decided." };
  await prisma.$transaction([
    prisma.organizerReport.update({
      where: { id: r.id },
      data: { status: input.outcome, adminNote: note, reviewedById: input.adminId, reviewedAt: new Date() },
    }),
    prisma.adminActionLog.create({
      data: { adminId: input.adminId, action: input.outcome === "upheld" ? "upheld_organizer_report" : "dismissed_organizer_report", targetType: "OrganizerReport", targetId: r.id, notes: note },
    }),
  ]);
  await notify(r.reporterUserId, {
    type: "report",
    title: input.outcome === "upheld" ? "Your report was upheld" : "Your report was reviewed",
    body: `Your report about "${r.tournament.name}": ${note}`,
    href: "/reports",
  });
  return { data: { id: r.id } };
}

export async function setOrganizerPause(input: { adminId: string; organizerId: string; paused: boolean; note: string }) {
  const note = input.note.trim();
  if (!note) return { error: "validation_error" as const, message: "Add a note explaining the decision." };
  const org = await prisma.organizerProfile.findUnique({ where: { id: input.organizerId }, select: { id: true, userId: true } });
  if (!org) return { error: "not_found" as const };
  await prisma.$transaction([
    prisma.organizerProfile.update({
      where: { id: org.id },
      data: input.paused ? { reportsPausedAt: new Date(), reportsPauseReason: note } : { reportsPausedAt: null, reportsPauseReason: null },
    }),
    prisma.adminActionLog.create({
      data: { adminId: input.adminId, action: input.paused ? "paused_organizer" : "lifted_organizer_pause", targetType: "OrganizerProfile", targetId: org.id, notes: note },
    }),
  ]);
  await notify(org.userId, {
    type: "report",
    title: input.paused ? "Your paid events were paused by an admin" : "Your paid events are no longer paused",
    body: note,
    href: "/organizer/dashboard",
  });
  return { data: { id: org.id } };
}

// For the report page: did this person take part in a staked event they don't run?
export async function canReportTournament(userId: string, tournamentId: string) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { name: true, entryType: true, prizePoolAmount: true, organizer: { select: { userId: true, orgName: true } } },
  });
  if (!t || t.organizer.userId === userId) return null;
  const staked = t.entryType === "paid" || (t.prizePoolAmount != null && Number(t.prizePoolAmount.toString()) > 0);
  if (!staked) return null;
  const took = await prisma.registration.count({
    where: {
      tournamentId,
      OR: [{ player: { userId } }, { teamEntry: { members: { some: { player: { userId } } } } }],
    },
  });
  return took > 0 ? { tournamentName: t.name, organizerName: t.organizer.orgName } : null;
}
