// Everything the admin sees on one organization's page: who runs it, the identity
// check (KYC), the plan and what it paid the platform, what it earned and promised
// as prizes, complaints, challenges and growth.
//
// The platform never holds players' money (entry fees and prizes are paid directly
// between people), so "earned" means entry fees recorded as paid on registrations,
// and "spent" means prize pool announced and prize payouts the organizer marked as sent.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FREE_PLAN_CODE } from "@/lib/plans";
import { describeLimits } from "@/lib/plan-copy";
import { identityState } from "@/lib/identity";
import { sumByCurrency, type MoneyLike } from "@/lib/money";
import { getOrganizerTrustSummary, HOLD_REASON_TEXT } from "@/lib/services/organizer-trust";
import { planStateOf } from "@/lib/services/admin-organizations";
import { getRatingSummary } from "@/lib/services/organizer-ratings";
import { getFundSupportFor } from "@/lib/services/donations";

const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

function lastMonths(n: number) {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}

export async function getOrganizationDetail(id: string) {
  const org = await prisma.organizerProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          kycStatus: true,
          createdAt: true,
          playerProfile: { select: { firstName: true, lastName: true, username: true, mobileNumber: true, country: true, region: true, city: true, age: true, gender: true } },
        },
      },
      institution: { include: { _count: { select: { members: true } } } },
      identity: true,
      members: { select: { id: true, name: true, email: true, role: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!org) return null;

  const ownerId = org.userId;
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5, 1));
  const months = lastMonths(6);

  const [
    application,
    plan,
    allPlans,
    trust,
    ban,
    lastVisit,
    createdBy,
    tournaments,
    paidRegs,
    regTotals,
    uniquePlayers,
    payoutsByStatus,
    payoutRows,
    reports,
    recentReports,
    challengeRows,
    challengeApps,
    planRequests,
    assignments,
    platformPayments,
    deposits,
    activity,
    growthTournaments,
    growthRegistrations,
  ] = await Promise.all([
    prisma.organizationApplication.findUnique({ where: { userId: ownerId } }),
    prisma.plan.findUnique({ where: { code: org.planCode } }),
    prisma.plan.findMany({ where: { audience: "organizer" }, select: { code: true, name: true } }),
    getOrganizerTrustSummary(org.id),
    prisma.accountBan.findFirst({ where: { userId: ownerId, liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, select: { reason: true, endsAt: true } }),
    prisma.visitSession.findFirst({ where: { userId: ownerId }, orderBy: { createdAt: "desc" }, select: { country: true, deviceType: true, createdAt: true } }),
    org.createdByAdminId ? prisma.user.findUnique({ where: { id: org.createdByAdminId }, select: { displayName: true } }) : Promise.resolve(null),
    prisma.tournament.findMany({
      where: { organizerId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        entryType: true,
        entryFeeAmount: true,
        entryFeeCurrency: true,
        prizePoolAmount: true,
        prizePoolCurrency: true,
        createdAt: true,
        _count: { select: { registrations: true } },
      },
    }),
    prisma.registration.groupBy({ by: ["tournamentId"], where: { tournament: { organizerId: id }, paymentStatus: "paid", status: { not: "rejected" } }, _count: true }),
    prisma.registration.groupBy({ by: ["status"], where: { tournament: { organizerId: id } }, _count: true }),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(DISTINCT r."playerId")::int AS n FROM "Registration" r JOIN "Tournament" t ON t.id = r."tournamentId" WHERE t."organizerId" = ${id} AND r."playerId" IS NOT NULL`),
    prisma.prizePayout.groupBy({ by: ["status"], where: { tournament: { organizerId: id } }, _count: true }),
    prisma.prizePayout.findMany({ where: { tournament: { organizerId: id } }, select: { amount: true, currency: true, status: true } }),
    prisma.organizerReport.groupBy({ by: ["status"], where: { organizerId: id }, _count: true }),
    prisma.organizerReport.findMany({ where: { organizerId: id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, kind: true, status: true, description: true, createdAt: true, reporterUserId: true, tournament: { select: { name: true } } } }),
    prisma.challenge.findMany({ where: { posterUserId: ownerId, posterType: "organizer" }, select: { status: true, prizeUsd: true, cashAmount: true, cashCurrency: true, createdAt: true } }),
    prisma.challengeApplication.count({ where: { challenge: { posterUserId: ownerId, posterType: "organizer" } } }),
    prisma.planRequest.findMany({ where: { userId: ownerId, audience: "organizer" }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, planCode: true, status: true, adminNote: true, createdAt: true, reviewedAt: true } }),
    prisma.adminActionLog.findMany({ where: { action: "assigned_organizer_plan", targetType: "OrganizerProfile", targetId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, notes: true, createdAt: true } }),
    prisma.paymentRecord.findMany({ where: { userId: ownerId, kind: "org_plan" }, orderBy: { createdAt: "desc" }, select: { id: true, amount: true, currency: true, method: true, createdAt: true } }),
    prisma.securityDeposit.findMany({ where: { organizerId: id }, orderBy: { heldAt: "desc" }, select: { id: true, planCode: true, amount: true, currency: true, status: true, heldAt: true, refundedAmount: true, forfeitedAmount: true } }),
    prisma.adminActionLog.findMany({ where: { OR: [{ targetId: id }, { targetId: ownerId }] }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, action: true, notes: true, createdAt: true, admin: { select: { displayName: true } } } }),
    prisma.$queryRaw<{ m: Date; n: number }[]>(Prisma.sql`SELECT date_trunc('month', t."createdAt") AS m, count(*)::int AS n FROM "Tournament" t WHERE t."organizerId" = ${id} AND t."createdAt" >= ${since} GROUP BY 1`),
    prisma.$queryRaw<{ m: Date; n: number }[]>(Prisma.sql`SELECT date_trunc('month', r."registeredAt") AS m, count(*)::int AS n FROM "Registration" r JOIN "Tournament" t ON t.id = r."tournamentId" WHERE t."organizerId" = ${id} AND r."registeredAt" >= ${since} GROUP BY 1`),
  ]);

  // ---- plan ----
  const planNames = new Map(allPlans.map((p) => [p.code, p.name]));
  const planState = planStateOf(org.planCode, org.planExpiresAt);
  const planHistory = [
    ...planRequests.map((r) => ({
      at: (r.reviewedAt ?? r.createdAt).toISOString(),
      text: `${planNames.get(r.planCode) ?? r.planCode} — payment ${r.status}${r.adminNote ? `: ${r.adminNote}` : ""}`,
    })),
    ...assignments.map((a) => ({ at: a.createdAt.toISOString(), text: `Given by an admin: ${a.notes ?? ""}` })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  // ---- money ----
  const paidByTournament = new Map(paidRegs.map((r) => [r.tournamentId, r._count]));
  const feeItems: MoneyLike[] = [];
  for (const t of tournaments) {
    const paid = paidByTournament.get(t.id) ?? 0;
    if (t.entryType === "paid" && t.entryFeeAmount && t.entryFeeCurrency && paid > 0) {
      feeItems.push({ amount: num(t.entryFeeAmount) * paid, currency: t.entryFeeCurrency });
    }
  }
  const poolItems: MoneyLike[] = tournaments
    .filter((t) => t.prizePoolAmount && t.prizePoolCurrency && t.status !== "draft" && t.status !== "cancelled")
    .map((t) => ({ amount: num(t.prizePoolAmount), currency: t.prizePoolCurrency as string }));
  const sentItems = payoutRows.map((p) => ({ amount: p.amount, currency: p.currency }));
  const confirmedItems = payoutRows.filter((p) => p.status === "confirmed").map((p) => ({ amount: p.amount, currency: p.currency }));

  const payoutCount = (s: string) => payoutsByStatus.find((p) => p.status === s)?._count ?? 0;
  const payoutTotal = payoutsByStatus.reduce((n, p) => n + p._count, 0);

  // ---- tournaments / players / growth ----
  const byStatus: Record<string, number> = {};
  for (const t of tournaments) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  const monthKey = (d: Date) => d.toISOString().slice(0, 7);
  const tMap = new Map(growthTournaments.map((r) => [monthKey(r.m), r.n]));
  const rMap = new Map(growthRegistrations.map((r) => [monthKey(r.m), r.n]));
  const growth = months.map((m) => ({ month: m, tournaments: tMap.get(m) ?? 0, registrations: rMap.get(m) ?? 0 }));

  // ---- complaints ----
  const repCount = (s: string) => reports.find((r) => r.status === s)?._count ?? 0;
  const reporters = await prisma.user.findMany({ where: { id: { in: recentReports.map((r) => r.reporterUserId) } }, select: { id: true, displayName: true } });
  const reporterName = new Map(reporters.map((u) => [u.id, u.displayName]));

  // ---- challenges ----
  const chStatus: Record<string, number> = {};
  for (const c of challengeRows) chStatus[c.status] = (chStatus[c.status] ?? 0) + 1;

  const [ratings, fundSupport] = await Promise.all([getRatingSummary(id), getFundSupportFor(id)]);

  const ident = org.identity;
  const iState = identityState(ident);
  const p = org.user.playerProfile;

  return {
    id: org.id,
    name: org.orgName,
    type: org.institution ? ("institute" as const) : ("organization" as const),
    joinedAt: org.createdAt.toISOString(),
    addedByAdmin: createdBy?.displayName ?? (org.createdByAdminId ? "an admin" : null),

    owner: {
      id: ownerId,
      name: org.user.displayName,
      email: org.user.email ?? "",
      phone: org.user.phone ?? p?.mobileNumber ?? null,
      avatarUrl: org.user.avatarUrl,
      joinedAt: org.user.createdAt.toISOString(),
      approval: org.user.kycStatus,
      profile: p ? { name: [p.firstName, p.lastName].filter(Boolean).join(" ") || null, username: p.username, country: p.country, region: p.region, city: p.city, age: p.age, gender: p.gender } : null,
      lastSeen: lastVisit ? { country: lastVisit.country, device: lastVisit.deviceType, at: lastVisit.createdAt.toISOString() } : null,
      ban: ban ? { reason: ban.reason, endsAt: iso(ban.endsAt) } : null,
    },

    details: {
      bio: org.bio,
      orgType: org.orgType ?? application?.orgType ?? null,
      registrationNumber: org.registrationNumber ?? application?.registrationNumber ?? null,
      website: org.website ?? application?.website ?? null,
      country: org.country ?? application?.country ?? null,
      city: org.city ?? application?.city ?? null,
      address: org.address ?? application?.address ?? null,
      contactEmail: org.contactEmail ?? application?.contactEmail ?? null,
      contactPhone: org.contactPhone ?? application?.contactPhone ?? null,
      handler: application ? { name: application.handlerName, role: application.handlerRole, phone: application.handlerPhone } : null,
      description: application?.description ?? null,
    },

    members: org.members.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role })),

    institute: org.institution
      ? {
          id: org.institution.id,
          name: org.institution.name,
          kind: org.institution.kind,
          verified: org.institution.verified,
          verifiedAt: iso(org.institution.verifiedAt),
          hasProof: Boolean(org.institution.proofPath),
          players: org.institution._count.members,
        }
      : null,

    identity: ident
      ? {
          id: ident.id,
          state: iState,
          docType: ident.docType,
          fullName: ident.fullName,
          submittedAt: ident.submittedAt.toISOString(),
          reviewedAt: iso(ident.reviewedAt),
          validUntil: iso(ident.validUntil),
          attempts: ident.attemptCount,
          rejectionNote: ident.rejectionNote,
          retentionHold: ident.retentionHold,
          photosDeletedAt: iso(ident.purgedAt),
          photosUntil: ident.purgedAt ? null : iso(ident.purgeAfter),
          photos: { front: Boolean(ident.frontPath), back: Boolean(ident.backPath), selfie: Boolean(ident.selfiePath) },
        }
      : null,

    plan: {
      code: org.planCode,
      name: plan?.name ?? planNames.get(org.planCode) ?? org.planCode,
      isPaid: plan?.isPaid ?? org.planCode !== FREE_PLAN_CODE.organizer,
      state: planState,
      autoRenew: org.autoRenew,
      endsAt: org.planCode === FREE_PLAN_CODE.organizer ? null : iso(org.planExpiresAt),
      priceAmount: plan?.priceAmount ? num(plan.priceAmount) : null,
      priceCurrency: plan?.priceCurrency ?? null,
      depositAmount: plan?.depositAmount ? num(plan.depositAmount) : null,
      perks: plan ? describeLimits("organizer", plan.limits as Record<string, number | boolean | null>) : [],
      history: planHistory,
    },
    paidToPlatform: {
      totals: sumByCurrency(platformPayments.map((p) => ({ amount: p.amount, currency: p.currency }))),
      items: platformPayments.slice(0, 5).map((p) => ({ id: p.id, amount: num(p.amount), currency: p.currency, method: p.method, at: p.createdAt.toISOString() })),
    },
    deposits: deposits.map((d) => ({ id: d.id, plan: planNames.get(d.planCode) ?? d.planCode, amount: num(d.amount), currency: d.currency, status: d.status, at: d.heldAt.toISOString() })),

    trust: {
      graduated: trust.graduated,
      identityVerified: trust.identityVerified,
      limitsLifted: trust.limitsLifted,
      confirmedEvents: trust.confirmedEvents,
      eventsNeeded: trust.eventsNeeded,
      graduationEvents: trust.cfg.graduationEvents,
      holds: trust.holds.map((h) => ({ name: h.name, reason: HOLD_REASON_TEXT[h.reason] })),
      paused: org.reportsPausedAt ? { at: org.reportsPausedAt.toISOString(), reason: org.reportsPauseReason } : null,
    },

    money: {
      earned: sumByCurrency(feeItems),
      prizePool: sumByCurrency(poolItems),
      prizeSent: sumByCurrency(sentItems),
      prizeConfirmed: sumByCurrency(confirmedItems),
    },
    payouts: {
      total: payoutTotal,
      confirmed: payoutCount("confirmed"),
      awaiting: payoutCount("paid_by_organizer"),
      disputed: payoutCount("disputed"),
      confirmationRate: payoutTotal > 0 ? Math.round((payoutCount("confirmed") / payoutTotal) * 100) : null,
    },

    tournaments: {
      total: tournaments.length,
      byStatus,
      paid: tournaments.filter((t) => t.entryType === "paid").length,
      recent: tournaments.slice(0, 6).map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        status: t.status,
        entry: t.entryType === "paid" && t.entryFeeAmount ? { amount: num(t.entryFeeAmount), currency: t.entryFeeCurrency ?? "" } : null,
        prize: t.prizePoolAmount ? { amount: num(t.prizePoolAmount), currency: t.prizePoolCurrency ?? "" } : null,
        registrations: t._count.registrations,
        createdAt: t.createdAt.toISOString(),
      })),
    },
    players: {
      registrations: regTotals.reduce((n, r) => n + r._count, 0),
      approved: regTotals.find((r) => r.status === "approved")?._count ?? 0,
      unique: uniquePlayers[0]?.n ?? 0,
    },
    growth,

    ratings,
    fundSupport,

    complaints: {
      total: reports.reduce((n, r) => n + r._count, 0),
      open: repCount("open"),
      upheld: repCount("upheld"),
      dismissed: repCount("dismissed"),
      recent: recentReports.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        text: r.description,
        tournament: r.tournament.name,
        reporter: reporterName.get(r.reporterUserId) ?? "A player",
        at: r.createdAt.toISOString(),
      })),
    },

    challenges: {
      total: challengeRows.length,
      byStatus: chStatus,
      applications: challengeApps,
      prizeUsd: challengeRows.reduce((n, c) => n + num(c.prizeUsd), 0),
    },

    activity: activity.map((a) => ({ id: a.id, action: a.action.replace(/_/g, " "), notes: a.notes, by: a.admin.displayName, at: a.createdAt.toISOString() })),
  };
}

export type OrganizationDetail = NonNullable<Awaited<ReturnType<typeof getOrganizationDetail>>>;
