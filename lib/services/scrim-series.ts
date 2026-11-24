// Recurring scrim series. An organizer on a paid plan sets a schedule once (which days, which start
// times, until when or non-stop). A daily job (and the moment the series is created) turns it into
// ordinary scrim events about two weeks ahead. Each event is a normal Tournament: its own room,
// registrations, payments and results. The rules live in lib/scrim-series-rules.ts.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolvePlan } from "@/lib/plans";
import { makeTournamentSlug } from "@/lib/slug";
import { parseRuleList } from "@/lib/rules";
import { createTournament, publishTournament } from "@/lib/services/tournaments";
import { PlanLimitError, assertOrganizerCanCreateTournament } from "@/lib/services/plan-gates";
import { TrustLimitError, checkOrganizerTrust } from "@/lib/services/organizer-trust";
import {
  SERIES_HORIZON_DAYS, dateInZone, describeSchedule, occurrences, validateSeries, type Schedule,
} from "@/lib/scrim-series-rules";

const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (date: string, n: number) => toDateStr(new Date(asDate(date).getTime() + n * 86400000));

type SeriesRow = Prisma.ScrimSeriesGetPayload<object>;
const scheduleOf = (s: SeriesRow): Schedule => ({
  timezone: s.timezone, daysOfWeek: s.daysOfWeek, slotTimes: s.slotTimes,
  startDate: toDateStr(s.startDate), endDate: s.endDate ? toDateStr(s.endDate) : null, skipDates: s.skipDates,
});

function sessionName(series: SeriesRow, date: string, time: string, slotsPerDay: number) {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(asDate(date));
  const [h, m] = time.split(":").map(Number);
  const clock = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  void slotsPerDay;
  return `${series.name} · ${day} · ${clock}`.slice(0, 120);
}

// ------------------------------------------------------------
// Create
// ------------------------------------------------------------
export async function createSeries(userId: string, raw: Record<string, unknown>) {
  const organizer = await prisma.organizerProfile.findUnique({ where: { userId }, include: { user: { select: { kycStatus: true } } } });
  if (!organizer) return { error: "not_organizer" as const, message: "Only organizers can create a series." };
  if (organizer.user.kycStatus !== "approved") {
    return { error: "organizer_not_approved" as const, message: "Your organizer account must be approved before you can run events." };
  }

  const { limits } = await resolvePlan("organizer", organizer);
  const active = await prisma.scrimSeries.count({ where: { organizerId: organizer.id, status: { not: "ended" } } });
  const v = validateSeries(raw, limits, active);
  if (!v.ok) return { error: "validation_error" as const, message: v.message };
  const d = v.value;

  const game = await prisma.game.findUnique({ where: { id: d.gameId }, select: { id: true } });
  if (!game) return { error: "validation_error" as const, message: "That game doesn't exist." };

  // Fail now (not on the first generated day) if the plan's game limit or the new-organizer caps would block it.
  try {
    await assertOrganizerCanCreateTournament(organizer, d.gameId, { skipMonthly: true });
  } catch (e) {
    if (e instanceof PlanLimitError) return { error: "plan_limit" as const, message: e.message };
    throw e;
  }
  const trust = await checkOrganizerTrust({
    organizerId: organizer.id, entryType: d.entryType,
    entryFee: d.entryFeeAmount && d.entryFeeCurrency ? { amount: d.entryFeeAmount, currency: d.entryFeeCurrency } : null,
    prizePool: null, maxTeams: d.maxTeams,
  });
  if (!trust.ok) return { error: "trust_limit" as const, message: trust.message };

  const series = await prisma.scrimSeries.create({
    data: {
      slug: makeTournamentSlug(d.name), organizerId: organizer.id, gameId: d.gameId, name: d.name, description: d.description,
      bannerUrl: d.bannerUrl, mode: d.mode, maxTeamSize: d.maxTeamSize, maxTeams: d.maxTeams, playersPerRoom: d.playersPerRoom,
      entryType: d.entryType, entryFeeAmount: d.entryFeeAmount, entryFeeCurrency: d.entryFeeCurrency,
      paymentInstructions: d.paymentInstructions, rulesText: d.rulesText, country: d.country,
      timezone: d.timezone, daysOfWeek: d.daysOfWeek, slotTimes: d.slotTimes, startDate: asDate(d.startDate),
      endDate: d.endDate ? asDate(d.endDate) : null, skipDates: d.skipDates,
      discountTiers: d.discountTiers.length > 0 ? d.discountTiers : undefined,
    },
  });
  const generated = await generateSessions(series.id);
  return { data: { id: series.id, slug: series.slug, ...generated } };
}

// ------------------------------------------------------------
// Generate the next sessions (safe to run again and again)
// ------------------------------------------------------------
export async function generateSessions(seriesId: string, now = new Date()) {
  const series = await prisma.scrimSeries.findUnique({ where: { id: seriesId }, include: { organizer: { select: { id: true } } } });
  if (!series || series.status !== "active") return { created: 0, error: null as string | null };

  const sched = scheduleOf(series);
  const today = dateInZone(now, series.timezone);
  const horizon = addDays(today, SERIES_HORIZON_DAYS);
  const wanted = occurrences(sched, today, horizon).filter((o) => o.startAt > now);

  const have = new Set(
    (await prisma.tournament.findMany({ where: { seriesId }, select: { sessionNo: true } })).map((t) => t.sessionNo)
  );
  const rules = parseRuleList((series.rulesText ?? "").split(/\r?\n/).filter((l) => l.trim()));
  let created = 0;
  let error: string | null = null;

  for (const o of wanted) {
    if (have.has(o.sessionNo)) continue;
    let draftId: string | null = null;
    try {
      const t = await createTournament({
        organizerId: series.organizerId, gameId: series.gameId, name: sessionName(series, o.date, o.time, series.slotTimes.length),
        description: series.description ?? undefined, bannerUrl: series.bannerUrl ?? undefined, type: "scrim", mode: series.mode,
        maxTeamSize: series.maxTeamSize, maxTeams: series.maxTeams, playersPerRoom: series.playersPerRoom ?? undefined,
        format: "points_table", entryType: series.entryType,
        entryFeeAmount: series.entryFeeAmount ? Number(series.entryFeeAmount.toString()) : undefined,
        entryFeeCurrency: series.entryFeeCurrency ?? undefined, paymentInstructions: series.paymentInstructions ?? undefined,
        country: series.country, rules: rules.ok ? rules.value : undefined, startAt: o.startAt, seriesId, sessionNo: o.sessionNo,
      });
      draftId = t.id;
      const pub = await publishTournament(t.id, series.organizerId);
      if ("error" in pub && pub.error) {
        await prisma.tournament.delete({ where: { id: t.id } }).catch(() => undefined);
        error = ("message" in pub && pub.message) || `Could not publish a session (${pub.error}).`;
        break;
      }
      created++;
    } catch (e) {
      if (draftId) await prisma.tournament.delete({ where: { id: draftId } }).catch(() => undefined);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // another run made it first
      error = e instanceof PlanLimitError || e instanceof TrustLimitError ? e.message : "Could not create a session.";
      break;
    }
  }

  const finished = sched.endDate !== null && sched.endDate < today && !(await prisma.tournament.count({
    where: { seriesId, startAt: { gt: now }, status: { notIn: ["cancelled", "completed"] } },
  }));
  await prisma.scrimSeries.update({
    where: { id: seriesId },
    data: { lastGeneratedAt: now, lastError: error, ...(finished ? { status: "ended" as const } : {}) },
  });
  return { created, error };
}

/** The daily job: top up every running series. One failing series never stops the others. */
export async function generateAllSeries(now = new Date()) {
  const all = await prisma.scrimSeries.findMany({ where: { status: "active" }, select: { id: true } });
  let created = 0, failed = 0;
  for (const s of all) {
    try {
      const r = await generateSessions(s.id, now);
      created += r.created;
      if (r.error) failed++;
    } catch {
      failed++;
    }
  }
  return { series: all.length, created, failed };
}

// ------------------------------------------------------------
// Pause, resume, end
// ------------------------------------------------------------
export async function setSeriesStatus(userId: string, seriesId: string, action: "pause" | "resume" | "end", now = new Date()) {
  const series = await prisma.scrimSeries.findUnique({ where: { id: seriesId }, include: { organizer: { select: { userId: true } } } });
  if (!series) return { error: "not_found" as const };
  if (series.organizer.userId !== userId) return { error: "forbidden" as const };
  if (series.status === "ended") return { error: "invalid_status" as const, message: "This series has already ended." };

  if (action === "pause") {
    if (series.status !== "active") return { error: "invalid_status" as const, message: "This series is already paused." };
    await prisma.scrimSeries.update({ where: { id: seriesId }, data: { status: "paused" } });
    return { data: { status: "paused" as const } };
  }
  if (action === "resume") {
    if (series.status !== "paused") return { error: "invalid_status" as const, message: "This series is not paused." };
    await prisma.scrimSeries.update({ where: { id: seriesId }, data: { status: "active" } });
    await generateSessions(seriesId, now);
    return { data: { status: "active" as const } };
  }
  // end: no more sessions, and upcoming ones nobody joined are cancelled. Ones with players stay
  // until the organizer cancels each (that is where refunds are handled).
  await prisma.scrimSeries.update({ where: { id: seriesId }, data: { status: "ended" } });
  const upcoming = await prisma.tournament.findMany({
    where: { seriesId, startAt: { gt: now }, status: { in: ["published", "registration_open"] } },
    select: { id: true, _count: { select: { registrations: { where: { status: { in: ["pending", "approved"] } } } } } },
  });
  const empty = upcoming.filter((t) => t._count.registrations === 0).map((t) => t.id);
  if (empty.length) await prisma.tournament.updateMany({ where: { id: { in: empty } }, data: { status: "cancelled" } });
  return { data: { status: "ended" as const, cancelledEmpty: empty.length, withPlayers: upcoming.length - empty.length } };
}

// ------------------------------------------------------------
// Reading
// ------------------------------------------------------------
const OPEN = ["published", "registration_open"] as const;

export async function getSeriesPublic(slug: string, now = new Date()) {
  const series = await prisma.scrimSeries.findUnique({
    where: { slug },
    include: { game: { select: { name: true } }, organizer: { select: { id: true, orgName: true } } },
  });
  if (!series) return null;
  const sessions = await prisma.tournament.findMany({
    where: { seriesId: series.id, status: { notIn: ["draft", "cancelled"] }, startAt: { gte: new Date(now.getTime() - 3 * 3600000) } },
    orderBy: { startAt: "asc" },
    take: 60,
    select: {
      id: true, slug: true, name: true, startAt: true, status: true, maxTeams: true, entryType: true,
      _count: { select: { registrations: { where: { status: { in: ["pending", "approved"] } } } } },
    },
  });
  return {
    series: { ...series, entryFeeAmount: series.entryFeeAmount ? Number(series.entryFeeAmount.toString()) : null, schedule: describeSchedule(series) },
    sessions: sessions.map((s) => ({
      id: s.id, slug: s.slug, name: s.name, startAt: s.startAt as Date, status: s.status,
      taken: s._count.registrations, capacity: s.maxTeams, full: s._count.registrations >= s.maxTeams,
      open: (OPEN as readonly string[]).includes(s.status),
    })),
  };
}

/** The session the evergreen link opens: the soonest one still taking sign-ups, else the soonest upcoming. */
export async function nextOpenSessionSlug(slug: string, now = new Date()) {
  const data = await getSeriesPublic(slug, now);
  if (!data) return null;
  const upcoming = data.sessions.filter((s) => s.startAt > now);
  return (upcoming.find((s) => s.open && !s.full) ?? upcoming[0])?.slug ?? null;
}

/** Just enough to link a session back to its series page. */
export async function getSeriesBrief(seriesId: string | null | undefined) {
  if (!seriesId) return null;
  return prisma.scrimSeries.findUnique({ where: { id: seriesId }, select: { slug: true, name: true } });
}

export async function listMySeries(userId: string) {
  const rows = await prisma.scrimSeries.findMany({
    where: { organizer: { userId } }, orderBy: { createdAt: "desc" },
    include: { game: { select: { name: true } }, _count: { select: { sessions: true } } },
  });
  return rows.map((s) => ({ ...s, entryFeeAmount: s.entryFeeAmount ? Number(s.entryFeeAmount.toString()) : null, schedule: describeSchedule(s) }));
}

export { nextSessionIdsBySeries } from "@/lib/services/series-browse";
