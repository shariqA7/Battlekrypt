// Read-only queries behind the admin overview, people lists, payments and
// traffic pages. Everything here is admin-only — callers must have passed
// requireAdminPage() first.
import { prisma } from "@/lib/prisma";
import { countryName } from "@/lib/geo";
import { toNumber } from "@/lib/money";

const DAY = 86_400_000;

export interface SeriesPoint {
  label: string; // YYYY-MM-DD
  value: number;
}

// Counts rows per day for the last `days` days (today included), zero-filled.
function bucketByDay(dates: Date[], days: number): SeriesPoint[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setTime(start.getTime() - (days - 1) * DAY);
  const counts = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    counts.set(new Date(start.getTime() + i * DAY).toISOString().slice(0, 10), 0);
  }
  for (const d of dates) {
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString().slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([label, value]) => ({ label, value }));
}

function tally<T>(rows: T[], key: (r: T) => string | null | undefined, top = 8) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r) || "Unknown";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
}

export async function getOverview() {
  const since30 = new Date(Date.now() - 30 * DAY);

  const [
    users,
    players,
    organizers,
    pendingApps,
    clubsActive,
    clubsPaid,
    clubsDisbanded,
    teams,
    tournaments,
    liveTournaments,
    registrations,
    activeBans,
    newUsers,
    sessions30,
    payments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.playerProfile.count(),
    prisma.organizerProfile.count(),
    prisma.organizationApplication.count({ where: { status: "pending" } }),
    prisma.clubProfile.count({ where: { status: "approved" } }),
    prisma.clubProfile.count({ where: { status: "approved", subscriptionPlanCode: { not: "club_free" } } }),
    prisma.clubProfile.count({ where: { status: "disbanded" } }),
    prisma.clubTeam.count(),
    prisma.tournament.count(),
    prisma.tournament.count({ where: { status: "in_progress" } }),
    prisma.registration.count(),
    prisma.accountBan.count({
      where: { liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
    }),
    prisma.user.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true } }),
    prisma.visitSession.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true, country: true } }),
    prisma.paymentRecord.findMany({ select: { amount: true, currency: true, createdAt: true } }),
  ]);

  const revenue: Record<string, number> = {};
  for (const p of payments) revenue[p.currency] = (revenue[p.currency] ?? 0) + toNumber(p.amount);

  return {
    counts: {
      users, players, organizers, pendingApps, clubsActive, clubsPaid, clubsDisbanded,
      teams, tournaments, liveTournaments, registrations, activeBans,
    },
    signups: bucketByDay(newUsers.map((u) => u.createdAt), 30),
    sessionsPerDay: bucketByDay(sessions30.map((s) => s.createdAt), 30),
    topCountries: tally(sessions30, (s) => (s.country ? countryName(s.country) : null), 5),
    revenue,
    paymentCount: payments.length,
  };
}

export async function listUsers(opts: { q?: string; page?: number }) {
  const pageSize = 25;
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { displayName: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        organizerProfile: { select: { orgName: true, planCode: true } },
        clubProfile: { select: { clubName: true, status: true, subscriptionPlanCode: true } },
        bans: {
          where: { liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
          select: { id: true },
        },
        visits: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { country: true, deviceType: true, createdAt: true },
        },
      },
    }),
  ]);
  return { users, total, page, pageSize };
}

export async function listOrganizations() {
  const [organizers, applications] = await Promise.all([
    prisma.organizerProfile.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { email: true, kycStatus: true } },
        _count: { select: { tournaments: true, members: true } },
      },
    }),
    prisma.organizationApplication.groupBy({ by: ["status"], _count: true }),
  ]);
  return { organizers, applications };
}

export async function listClubs() {
  return prisma.clubProfile.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { email: true, displayName: true } },
      _count: { select: { teams: true, roster: true } },
    },
  });
}

export async function getPayments() {
  const records = await prisma.paymentRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { email: true, displayName: true } } },
  });
  const all = await prisma.paymentRecord.findMany({
    select: { amount: true, currency: true, method: true, kind: true, createdAt: true },
  });

  const byCurrency: Record<string, number> = {};
  const byMethod: Record<string, Record<string, number>> = {};
  const byKind: Record<string, Record<string, number>> = {};
  const byMonth: Record<string, Record<string, number>> = {};
  for (const p of all) {
    const amt = toNumber(p.amount);
    byCurrency[p.currency] = (byCurrency[p.currency] ?? 0) + amt;
    const add = (bucket: Record<string, Record<string, number>>, key: string) => {
      bucket[key] ??= {};
      bucket[key][p.currency] = (bucket[key][p.currency] ?? 0) + amt;
    };
    add(byMethod, p.method);
    add(byKind, p.kind);
    add(byMonth, p.createdAt.toISOString().slice(0, 7));
  }
  return { records, byCurrency, byMethod, byKind, byMonth, total: all.length };
}

export async function getTraffic(days: number) {
  const since = new Date(Date.now() - days * DAY);
  const sessions = await prisma.visitSession.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true, displayName: true } } },
  });

  return {
    total: sessions.length,
    signedIn: sessions.filter((s) => s.userId).length,
    uniqueIps: new Set(sessions.map((s) => s.ip).filter(Boolean)).size,
    perDay: bucketByDay(sessions.map((s) => s.createdAt), Math.min(days, 90)),
    countries: tally(sessions, (s) => (s.country ? countryName(s.country) : null), 10),
    regions: tally(sessions, (s) => (s.region ? `${s.region}, ${countryName(s.country)}` : null), 10),
    devices: tally(sessions, (s) => s.deviceType),
    browsers: tally(sessions, (s) => s.browser),
    systems: tally(sessions, (s) => s.os),
    paths: tally(sessions, (s) => s.path, 10),
    referrers: tally(sessions.filter((s) => s.referrer), (s) => s.referrer, 8),
    recent: sessions.slice(0, 100),
  };
}
