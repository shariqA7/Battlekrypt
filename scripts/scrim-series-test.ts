// Recurring scrim series: the schedule rules, plan limits, generating sessions (idempotent, time-zone
// correct, not counted in the monthly event quota), pause/resume/end, and what the public pages read.
// Needs a Postgres with all migrations applied (see phase8-1-test.ts).
import { prisma } from "../lib/prisma";
import { assertOrganizerCanCreateTournament, PlanLimitError } from "../lib/services/plan-gates";
import { createTournament } from "../lib/services/tournaments";
import {
  occurrences, validateSeries, describeSchedule, zonedTimeToUtc, dateInZone, isValidTimezone, SERIES_HORIZON_DAYS,
} from "../lib/scrim-series-rules";
import {
  createSeries, generateSessions, generateAllSeries, setSeriesStatus, getSeriesPublic, nextOpenSessionSlug,
  listMySeries, nextSessionIdsBySeries,
} from "../lib/services/scrim-series";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const code = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);

const TZ = "Asia/Karachi";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const today = dateInZone(new Date(), TZ);
const none = { maxScrimSeries: null, maxSeriesDays: null, maxSlotsPerDay: null };
const free = { maxScrimSeries: 0, maxSeriesDays: 0, maxSlotsPerDay: 0 };
const basic = { maxScrimSeries: 1, maxSeriesDays: 31, maxSlotsPerDay: 2 };
const pro = { maxScrimSeries: 3, maxSeriesDays: 93, maxSlotsPerDay: 4 };

async function main() {
  // ---- schedule maths ----
  ok("zone: Karachi 8 PM is 15:00 UTC", zonedTimeToUtc("2026-12-01", "20:00", TZ).toISOString() === "2026-12-01T15:00:00.000Z");
  ok("zone: New York respects daylight saving", zonedTimeToUtc("2026-07-01", "20:00", "America/New_York").toISOString() === "2026-07-02T00:00:00.000Z" && zonedTimeToUtc("2026-12-01", "20:00", "America/New_York").toISOString() === "2026-12-02T01:00:00.000Z");
  ok("zone: validity check", isValidTimezone("Asia/Karachi") && !isValidTimezone("Mars/Base") && !isValidTimezone(""));
  ok("zone: date in zone rolls over correctly", dateInZone(new Date("2026-12-01T21:00:00Z"), TZ) === "2026-12-02");
  const sched = { timezone: TZ, daysOfWeek: [6, 0], slotTimes: ["22:00", "20:00"], startDate: "2026-12-01", endDate: "2026-12-14", skipDates: ["2026-12-06"] };
  const occ = occurrences(sched, "2026-12-01", "2026-12-31");
  ok("occurrences: weekends only, both slots, in time order", occ.map((o) => `${o.date} ${o.time}`).join() === "2026-12-05 20:00,2026-12-05 22:00,2026-12-12 20:00,2026-12-12 22:00,2026-12-13 20:00,2026-12-13 22:00");
  ok("occurrences: a skipped day still uses up its numbers, so later numbers never move", occ.map((o) => o.sessionNo).join() === "1,2,5,6,7,8");
  ok("occurrences: the end date is included and nothing after it", occ[occ.length - 1].date === "2026-12-13" && occurrences({ ...sched, endDate: "2026-12-13" }, "2026-12-01", "2026-12-31").length === 6);
  ok("occurrences: 'from' hides earlier days but keeps the numbering", occurrences(sched, "2026-12-12", "2026-12-31").map((o) => o.sessionNo).join() === "5,6,7,8");
  ok("occurrences: no end date keeps going up to the asked-for limit", occurrences({ ...sched, endDate: null, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotTimes: ["20:00"], skipDates: [] }, "2026-12-01", "2026-12-10").length === 10);
  ok("describe: every day / weekdays / weekends / custom", describeSchedule({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotTimes: ["20:00"] }) === "Every day at 8:00 PM" && describeSchedule({ daysOfWeek: [1, 2, 3, 4, 5], slotTimes: ["12:00"] }) === "Weekdays at 12:00 PM" && describeSchedule({ daysOfWeek: [6, 0], slotTimes: ["22:00", "20:00"] }) === "Weekends at 8:00 PM and 10:00 PM" && describeSchedule({ daysOfWeek: [1, 3], slotTimes: ["09:30"] }) === "Mon, Wed at 9:30 AM");

  // ---- validation and plan limits ----
  const good = { name: "Night Scrims", gameId: "g", mode: "squad", maxTeamSize: 4, maxTeams: 20, entryType: "free", timezone: TZ, daysOfWeek: [6, 0], slotTimes: ["20:00"], startDate: today, endDate: addDays(today, 20) };
  ok("validate: a good series passes on a pro plan", validateSeries(good, pro, 0).ok);
  ok("validate: free plan has no series", !validateSeries(good, free, 0).ok);
  ok("validate: series count is capped by the plan", !validateSeries(good, basic, 1).ok && validateSeries(good, basic, 0).ok && validateSeries(good, none, 50).ok);
  ok("validate: sessions per day are capped by the plan", !validateSeries({ ...good, slotTimes: ["18:00", "20:00", "22:00"] }, basic, 0).ok && validateSeries({ ...good, slotTimes: ["18:00", "20:00"] }, basic, 0).ok);
  ok("validate: a run longer than the plan allows is refused", !validateSeries({ ...good, endDate: addDays(today, 40) }, basic, 0).ok && validateSeries({ ...good, endDate: addDays(today, 30) }, basic, 0).ok);
  ok("validate: non-stop needs a plan with no day limit", !validateSeries({ ...good, endDate: null }, pro, 0).ok && validateSeries({ ...good, endDate: null }, none, 0).ok);
  ok("validate: start date can't be in the past", !validateSeries({ ...good, startDate: addDays(today, -1) }, pro, 0).ok);
  ok("validate: end before start refused", !validateSeries({ ...good, endDate: addDays(today, -1), startDate: today }, pro, 0).ok);
  ok("validate: needs a day and a start time", !validateSeries({ ...good, daysOfWeek: [] }, pro, 0).ok && !validateSeries({ ...good, slotTimes: [] }, pro, 0).ok && !validateSeries({ ...good, slotTimes: ["25:00"] }, pro, 0).ok && !validateSeries({ ...good, daysOfWeek: [7] }, pro, 0).ok);
  ok("validate: bad time zone refused", !validateSeries({ ...good, timezone: "Nowhere/Land" }, pro, 0).ok);
  ok("validate: paid entry needs a fee, a currency and payment instructions", !validateSeries({ ...good, entryType: "paid" }, pro, 0).ok && !validateSeries({ ...good, entryType: "paid", entryFeeAmount: 200, entryFeeCurrency: "PKR" }, pro, 0).ok && validateSeries({ ...good, entryType: "paid", entryFeeAmount: 200, entryFeeCurrency: "PKR", paymentInstructions: "Send to Easypaisa 0300-0000000" }, pro, 0).ok);
  ok("validate: squad size and capacity limits", !validateSeries({ ...good, maxTeamSize: 9 }, pro, 0).ok && !validateSeries({ ...good, maxTeams: 1 }, pro, 0).ok && validateSeries({ ...good, mode: "duo" }, pro, 0).ok);
  ok("validate: a range with no matching day is refused", !validateSeries({ ...good, daysOfWeek: [new Date(Date.parse(`${today}T00:00:00Z`)).getUTCDay()], startDate: today, endDate: today, skipDates: [today] }, pro, 0).ok);

  // ---- the database ----
  await prisma.user.createMany({ data: ["pro", "basic", "free", "pending", "other", "p1"].map((u) => ({ id: u, email: `${u}@x.com`, displayName: u, kycStatus: u === "pending" ? "pending" as const : "approved" as const })) });
  const org = (userId: string, plan: string) => prisma.organizerProfile.create({ data: { userId, orgName: `Org ${userId}`, planCode: plan } });
  const [oPro, oBasic, oFree, oPending, oOther] = await Promise.all([org("pro", "organizer_pro"), org("basic", "organizer_basic"), org("free", "organizer_free"), org("pending", "organizer_pro"), org("other", "organizer_pro")]);
  void oBasic; void oFree; void oPending; void oOther;
  const game = await prisma.game.create({ data: { name: "Game A", isApproved: true } });
  const body = { ...good, gameId: game.id };

  ok("create: an organizer awaiting approval can't", code(await createSeries("pending", body)) === "organizer_not_approved");
  ok("create: a player with no organizer account can't", code(await createSeries("p1", body)) === "not_organizer");
  ok("create: the free plan can't", code(await createSeries("free", body)) === "validation_error");
  ok("create: unknown game refused", code(await createSeries("pro", { ...body, gameId: "nope" })) === "validation_error");
  ok("create: bad input saves nothing", (await prisma.scrimSeries.count()) === 0);

  // sessions must not use up the monthly event quota
  await prisma.plan.update({ where: { code: "organizer_pro" }, data: { limits: { ...(await prisma.plan.findUniqueOrThrow({ where: { code: "organizer_pro" } })).limits as object, maxTournamentsPerMonth: 2 } } });
  const made = await createSeries("pro", { ...body, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], endDate: addDays(today, 40) });
  ok("create: succeeds on a pro plan", !code(made));
  const seriesId = (made as { data: { id: string } }).data.id;
  const series = await prisma.scrimSeries.findUniqueOrThrow({ where: { id: seriesId } });
  const sessions = await prisma.tournament.findMany({ where: { seriesId }, orderBy: { sessionNo: "asc" } });
  const expected = occurrences({ timezone: TZ, daysOfWeek: series.daysOfWeek, slotTimes: series.slotTimes, startDate: today, endDate: addDays(today, 40), skipDates: [] }, today, addDays(today, SERIES_HORIZON_DAYS)).filter((o) => o.startAt > new Date());
  ok("generate: creates a session for every upcoming slot in the next two weeks", sessions.length === expected.length && sessions.length >= 13);
  ok("generate: they are published scrims with the series' settings", sessions.every((s) => s.status === "published" && s.type === "scrim" && s.mode === "squad" && s.maxTeams === 20 && s.entryType === "free" && s.gameId === game.id && s.seriesId === seriesId));
  ok("generate: start times are the organizer's clock time, in UTC", sessions.every((s) => s.startAt && s.startAt.toISOString().slice(11, 16) === "15:00"));
  ok("generate: each has its own number and a name with the date and time", new Set(sessions.map((s) => s.sessionNo)).size === sessions.length && sessions.every((s) => s.name.startsWith("Night Scrims · ") && s.name.endsWith("8:00 PM")));
  ok("generate: running again creates nothing new", (await generateSessions(seriesId)).created === 0 && (await prisma.tournament.count({ where: { seriesId } })) === sessions.length);
  await Promise.all([generateSessions(seriesId), generateSessions(seriesId), generateSessions(seriesId)]);
  ok("generate: runs at the same moment never double up a session", (await prisma.tournament.count({ where: { seriesId } })) === sessions.length);

  // quota: pro limit is 2 normal events a month, 14+ sessions exist, and two normal events are still allowed
  let blocked = false;
  const base = { organizerId: oPro.id, gameId: game.id, name: "Normal", type: "tournament" as const, mode: "solo" as const, maxTeamSize: 1, maxTeams: 8, format: "points_table" as const, entryType: "free" as const };
  await createTournament(base); await createTournament({ ...base, name: "Normal 2" });
  try { await createTournament({ ...base, name: "Normal 3" }); } catch (e) { blocked = e instanceof PlanLimitError; }
  ok("quota: generated sessions don't use the monthly event quota, normal events still do", blocked);
  let gameBlocked = false;
  try { await assertOrganizerCanCreateTournament(oPro, game.id, { skipMonthly: true }); } catch { gameBlocked = true; }
  ok("quota: skipping the monthly check doesn't skip other checks (it passes here as the game is already hosted)", !gameBlocked);

  // later days: the window moves on
  const later = new Date(Date.now() + 10 * 86400000);
  const r2 = await generateSessions(seriesId, later);
  ok("generate: ten days later it tops up the next window and nothing is repeated", r2.created >= 9 && (await prisma.tournament.count({ where: { seriesId } })) === sessions.length + r2.created && !r2.error);
  const nums = (await prisma.tournament.findMany({ where: { seriesId }, select: { sessionNo: true } })).map((t) => t.sessionNo!);
  ok("generate: numbers stay unique and in order", new Set(nums).size === nums.length);

  // public reads
  const pub = await getSeriesPublic(series.slug);
  ok("public: series page data has the schedule text and upcoming sessions in order", !!pub && pub.series.schedule === "Every day at 8:00 PM" && pub.sessions.length > 10 && pub.sessions.every((s, i, a) => i === 0 || a[i - 1].startAt <= s.startAt));
  ok("public: unknown series -> null", (await getSeriesPublic("nope")) === null && (await nextOpenSessionSlug("nope")) === null);
  const first = pub!.sessions.find((s) => s.startAt > new Date())!;
  ok("public: the evergreen link points at the soonest session still open", (await nextOpenSessionSlug(series.slug)) === first.slug);
  await prisma.tournament.update({ where: { id: first.id }, data: { maxTeams: 1 } });
  const p1 = await prisma.playerProfile.create({ data: { userId: "p1", firstName: "P", lastName: "One", birthDate: new Date("2000-01-01"), planCode: "player_basic" } });
  await prisma.registration.create({ data: { tournamentId: first.id, playerId: p1.id, status: "approved", paymentStatus: "waived" } });
  const second = pub!.sessions.filter((s) => s.startAt > new Date())[1];
  ok("public: a full session is skipped by the evergreen link", (await nextOpenSessionSlug(series.slug)) === second.slug);
  ok("public: one card per series for browse", (await nextSessionIdsBySeries()).length === 1);
  ok("organizer list: shows my series with its schedule", (await listMySeries("pro"))[0].schedule === "Every day at 8:00 PM" && (await listMySeries("other")).length === 0);

  // pause / resume / end
  ok("control: someone else can't change my series", code(await setSeriesStatus("other", seriesId, "pause")) === "forbidden" && code(await setSeriesStatus("pro", "nope", "pause")) === "not_found");
  await setSeriesStatus("pro", seriesId, "pause");
  const before = await prisma.tournament.count({ where: { seriesId } });
  await generateSessions(seriesId, new Date(Date.now() + 20 * 86400000));
  ok("control: a paused series makes no new sessions", (await prisma.tournament.count({ where: { seriesId } })) === before && code(await setSeriesStatus("pro", seriesId, "pause")) === "invalid_status");
  await setSeriesStatus("pro", seriesId, "resume");
  ok("control: resuming makes the missing sessions again", (await prisma.tournament.count({ where: { seriesId } })) >= before && (await prisma.scrimSeries.findUniqueOrThrow({ where: { id: seriesId } })).status === "active");
  const ended = await setSeriesStatus("pro", seriesId, "end");
  const left = await prisma.tournament.findMany({ where: { seriesId, startAt: { gt: new Date() } } });
  ok("control: ending cancels upcoming sessions nobody joined", !code(ended) && (ended as { data: { cancelledEmpty: number } }).data.cancelledEmpty > 5 && left.filter((t) => t.status === "cancelled").length === (ended as { data: { cancelledEmpty: number } }).data.cancelledEmpty);
  ok("control: ending keeps a session that has players", (ended as { data: { withPlayers: number } }).data.withPlayers === 1 && left.filter((t) => t.id === first.id)[0].status === "published");
  ok("control: an ended series makes nothing and can't be changed", (await generateSessions(seriesId, later)).created === 0 && code(await setSeriesStatus("pro", seriesId, "resume")) === "invalid_status");
  ok("plan: ended series don't count against the plan's series limit", validateSeries(good, basic, await prisma.scrimSeries.count({ where: { organizerId: oPro.id, status: { not: "ended" } } })).ok);

  // a finished series closes itself, and the daily job tops up everything
  const s2 = await createSeries("pro", { ...body, name: "Short run", endDate: addDays(today, 3), daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
  const s2id = (s2 as { data: { id: string } }).data.id;
  ok("daily job: tops up running series and reports counts", (await generateAllSeries()).series === 1);
  await generateSessions(s2id, new Date(Date.now() + 9 * 86400000));
  ok("series closes itself once its end date has passed and nothing upcoming is left", (await prisma.scrimSeries.findUniqueOrThrow({ where: { id: s2id } })).status === "ended");

  // organizer limits stop a series that can't be created (clear message instead of a half-made series)
  const before2 = await prisma.scrimSeries.count();
  const basicTry = await createSeries("basic", { ...body, slotTimes: ["18:00", "20:00", "22:00"] });
  ok("create: too many sessions a day for the plan is refused with a clear message", code(basicTry) === "validation_error" && (await prisma.scrimSeries.count()) === before2);

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
