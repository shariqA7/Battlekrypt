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

// ---------------------------------------------------------------------------
// Dashboard (the /admin home page) with a time-range filter.
// ---------------------------------------------------------------------------

export type DashRange = "today" | "week" | "month" | "6m" | "12m" | "all";

export const DASH_RANGES: { key: DashRange; label: string; long: string }[] = [
  { key: "today", label: "Today", long: "today" },
  { key: "week", label: "Week", long: "the last 7 days" },
  { key: "month", label: "Month", long: "the last 30 days" },
  { key: "6m", label: "6M", long: "the last 6 months" },
  { key: "12m", label: "12M", long: "the last 12 months" },
  { key: "all", label: "All time", long: "all time" },
];

export const DEFAULT_DASH_RANGE: DashRange = "month";

export function parseDashRange(v: string | undefined): DashRange {
  return DASH_RANGES.some((r) => r.key === v) ? (v as DashRange) : DEFAULT_DASH_RANGE;
}

type Unit = "hour" | "day" | "week" | "month";
type Win = { gte?: Date; lt?: Date } | undefined;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// The window a range covers, the chart bucket size, and (for everything except
// "all") the equally long window right before it, used for the +/- comparison.
function dashWindow(range: DashRange, earliest: Date | null) {
  const now = new Date();
  const today = startOfToday();
  let since: Date | null;
  let unit: Unit;
  switch (range) {
    case "today": since = today; unit = "hour"; break;
    case "week": since = new Date(today.getTime() - 6 * DAY); unit = "day"; break;
    case "month": since = new Date(today.getTime() - 29 * DAY); unit = "day"; break;
    case "6m": since = new Date(today.getTime() - 181 * DAY); unit = "week"; break;
    case "12m": since = new Date(now.getFullYear(), now.getMonth() - 11, 1); unit = "month"; break;
    default: {
      // All time: monthly bars from the first account (or the last 12 months if empty).
      const first = earliest ?? new Date(now.getFullYear(), now.getMonth() - 11, 1);
      since = new Date(first.getFullYear(), first.getMonth(), 1);
      unit = "month";
    }
  }
  const prev = range === "all" ? null : { from: new Date(since.getTime() - (now.getTime() - since.getTime())), to: since };
  return { now, since, unit, prev, filterSince: range === "all" ? null : since };
}

const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtMonth = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });

export interface DashPoint {
  label: string; // axis label, already formatted for people
  value: number;
}

// Zero-filled counts per bucket between `since` and now.
function bucketSeries(dates: Date[], since: Date, now: Date, unit: Unit): DashPoint[] {
  const starts: Date[] = [];
  if (unit === "hour") {
    for (let h = 0; h < 24; h++) starts.push(new Date(since.getTime() + h * 3_600_000));
  } else if (unit === "month") {
    const c = new Date(since.getFullYear(), since.getMonth(), 1);
    while (c <= now) { starts.push(new Date(c)); c.setMonth(c.getMonth() + 1); }
  } else {
    const step = unit === "week" ? 7 * DAY : DAY;
    for (let t = since.getTime(); t <= now.getTime(); t += step) starts.push(new Date(t));
  }

  const counts = new Array<number>(starts.length).fill(0);
  for (const d of dates) {
    let i: number;
    if (unit === "hour") i = Math.floor((d.getTime() - since.getTime()) / 3_600_000);
    else if (unit === "month") i = (d.getFullYear() - since.getFullYear()) * 12 + d.getMonth() - since.getMonth();
    else i = Math.floor((d.getTime() - since.getTime()) / (unit === "week" ? 7 * DAY : DAY));
    if (i >= 0 && i < counts.length) counts[i] += 1;
  }

  return starts.map((d, i) => ({
    label: unit === "hour" ? `${String(d.getHours()).padStart(2, "0")}:00` : unit === "month" ? fmtMonth(d) : fmtDay(d),
    value: counts[i],
  }));
}

export interface DashStat {
  current: number; // inside the selected range
  previous: number | null; // the equally long range before it (null for "all time")
}

export async function getDashboard(range: DashRange) {
  const [first] = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } });
  const { now, since, unit, prev, filterSince } = dashWindow(range, first?.createdAt ?? null);

  const cur: Win = filterSince ? { gte: filterSince } : undefined;
  const prv: Win | null = prev ? { gte: prev.from, lt: prev.to } : null;
  const both = async (fn: (w: Win) => Promise<number>): Promise<DashStat> => {
    const [current, previous] = await Promise.all([fn(cur), prv ? fn(prv) : Promise.resolve(null)]);
    return { current, previous };
  };

  const [
    users, organizers, clubs, teams, tournaments, registrations, bans, sessionsStat,
    totalUsers, totalPlayers, totalOrganizers, pendingApps, clubsActive, clubsPaid, clubsDisbanded,
    totalTeams, totalTournaments, liveTournaments, totalRegistrations, activeBans,
    userDates, sessionRows, registrationDates, payments,
  ] = await Promise.all([
    both((w) => prisma.user.count({ where: w ? { createdAt: w } : {} })),
    both((w) => prisma.organizerProfile.count({ where: w ? { createdAt: w } : {} })),
    both((w) => prisma.clubProfile.count({ where: w ? { createdAt: w } : {} })),
    both((w) => prisma.clubTeam.count({ where: w ? { createdAt: w } : {} })),
    both((w) => prisma.tournament.count({ where: w ? { createdAt: w } : {} })),
    both((w) => prisma.registration.count({ where: w ? { registeredAt: w } : {} })),
    both((w) => prisma.accountBan.count({ where: w ? { createdAt: w } : {} })),
    both((w) => prisma.visitSession.count({ where: w ? { createdAt: w } : {} })),
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
    prisma.accountBan.count({ where: { liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } }),
    prisma.user.findMany({ where: cur ? { createdAt: cur } : {}, select: { createdAt: true } }),
    prisma.visitSession.findMany({ where: cur ? { createdAt: cur } : {}, select: { createdAt: true, country: true } }),
    prisma.registration.findMany({ where: cur ? { registeredAt: cur } : {}, select: { registeredAt: true } }),
    prisma.paymentRecord.findMany({ select: { amount: true, currency: true, createdAt: true } }),
  ]);

  // Revenue inside the range, per currency (never blended into one number).
  const revenue: Record<string, number> = {};
  let paymentCount = 0;
  for (const p of payments) {
    if (filterSince && p.createdAt < filterSince) continue;
    revenue[p.currency] = (revenue[p.currency] ?? 0) + toNumber(p.amount);
    paymentCount += 1;
  }

  return {
    range,
    periodLabel: range === "today" ? fmtDay(now) : range === "all" ? `Since ${fmtMonth(since)}` : `${fmtDay(since)} – ${fmtDay(now)}`,
    stats: { users, organizers, clubs, teams, tournaments, registrations, bans, sessions: sessionsStat },
    totals: {
      users: totalUsers, players: totalPlayers, organizers: totalOrganizers, pendingApps, clubsActive, clubsPaid,
      clubsDisbanded, teams: totalTeams, tournaments: totalTournaments, liveTournaments, registrations: totalRegistrations,
      activeBans,
    },
    revenue,
    paymentCount,
    signups: bucketSeries(userDates.map((u) => u.createdAt), since, now, unit),
    sessionsSeries: bucketSeries(sessionRows.map((s) => s.createdAt), since, now, unit),
    registrationsSeries: bucketSeries(registrationDates.map((r) => r.registeredAt), since, now, unit),
    topCountries: tally(sessionRows, (s) => (s.country ? countryName(s.country) : null), 5),
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
