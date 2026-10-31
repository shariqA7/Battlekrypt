// Player ratings of organizers: who may rate, the validation, editing, the average, and how an
// admin hides a rating. Needs a Postgres with all migrations applied (see phase8-1-test.ts).
import { prisma } from "../lib/prisma";
import { canRateTournament, rateOrganizer, getRatingSummary, setRatingHidden, listMyRatings, RATINGS_PER_DAY } from "../lib/services/organizer-ratings";
import { getOrganizationDetail } from "../lib/services/admin-organization-detail";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const code = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);

async function main() {
  await prisma.user.createMany({ data: ["adm", "org", "member", "p1", "p2", "p3", "p4", "p5", "pending", "outsider", "teamer"].map((u) => ({ id: u, email: `${u}@x.com`, displayName: u, isAdmin: u === "adm" })) });
  const pp: Record<string, string> = {};
  for (const u of ["p1", "p2", "p3", "p4", "p5", "pending", "outsider", "teamer", "member"]) pp[u] = (await prisma.playerProfile.create({ data: { userId: u } })).id;
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "Rated Org" } });
  await prisma.organizationMember.create({ data: { organizerId: org.id, userId: "member", email: "member@x.com", name: "Mem", role: "manager" } as never });
  const game = await prisma.game.create({ data: { name: "G" } });
  const mkT = (slug: string, status: "completed" | "in_progress") =>
    prisma.tournament.create({ data: { slug, organizerId: org.id, gameId: game.id, name: `Event ${slug}`, type: "tournament", mode: "solo", maxTeams: 8, format: "single_elimination", entryType: "free", status } });
  const t = await mkT("done", "completed");
  const live = await mkT("live", "in_progress");
  const reg = (tid: string, u: string, status: "approved" | "pending" = "approved") =>
    prisma.registration.create({ data: { tournamentId: tid, playerId: pp[u], status, paymentStatus: "waived" } });
  for (const u of ["p1", "p2", "p3", "p4", "p5"]) await reg(t.id, u);
  await reg(t.id, "pending", "pending");
  await reg(live.id, "p1");
  await reg(t.id, "member"); // a team member of the organization who also entered: still can't rate it
  // a team entry with "teamer" as a member
  const te = await prisma.teamEntry.create({ data: { tournamentId: t.id, name: "Team X" } });
  await prisma.teamMember.create({ data: { teamEntryId: te.id, playerId: pp.teamer } as never });
  await prisma.registration.create({ data: { tournamentId: t.id, teamEntryId: te.id, status: "approved", paymentStatus: "waived" } as never });

  // ---- who may rate ----
  ok("a player with an approved entry can rate", (await canRateTournament("p1", t.id))?.organizerName === "Rated Org");
  ok("a team member can rate", (await canRateTournament("teamer", t.id)) !== null);
  ok("a pending entry can't", (await canRateTournament("pending", t.id)) === null);
  ok("someone who didn't take part can't", (await canRateTournament("outsider", t.id)) === null);
  ok("the organizer can't rate itself", (await canRateTournament("org", t.id)) === null);
  ok("a team member of the organization can't", (await canRateTournament("member", t.id)) === null);
  ok("an event that isn't completed can't be rated", (await canRateTournament("p1", live.id)) === null);

  // ---- validation ----
  const base = { userId: "p1", tournamentId: t.id };
  ok("0 stars refused", code(await rateOrganizer({ ...base, stars: 0, comment: "" })) === "validation_error");
  ok("6 stars refused", code(await rateOrganizer({ ...base, stars: 6, comment: "" })) === "validation_error");
  ok("2.5 stars refused", code(await rateOrganizer({ ...base, stars: 2.5, comment: "" })) === "validation_error");
  ok("1 star needs a comment", code(await rateOrganizer({ ...base, stars: 1, comment: "bad" })) === "validation_error");
  ok("comment too long refused", code(await rateOrganizer({ ...base, stars: 5, comment: "x".repeat(501) })) === "validation_error");
  ok("someone who didn't take part is refused", code(await rateOrganizer({ userId: "outsider", tournamentId: t.id, stars: 5, comment: "" })) === "forbidden");
  ok("unknown event", code(await rateOrganizer({ ...base, tournamentId: "nope", stars: 5, comment: "" })) === "not_found");

  // ---- rating, editing ----
  const r1 = await rateOrganizer({ ...base, stars: 5, comment: "  Great event  " });
  ok("rating is saved (created)", "data" in r1 && r1.updated === false);
  const r2 = await rateOrganizer({ ...base, stars: 4, comment: "" });
  ok("rating again edits it, not a second row", "data" in r2 && r2.updated === true && (await prisma.organizerRating.count({ where: { raterUserId: "p1" } })) === 1);
  ok("comment trimmed, cleared when emptied", (await prisma.organizerRating.findFirst({ where: { raterUserId: "p1" } }))?.comment === null);
  ok("my ratings listed by event", (await listMyRatings("p1")).get(t.id) === 4);
  ok("existing rating shown on the form", (await canRateTournament("p1", t.id))?.existing?.stars === 4);
  await rateOrganizer({ userId: "p2", tournamentId: t.id, stars: 2, comment: "Prizes were never sent" });
  await rateOrganizer({ userId: "p3", tournamentId: t.id, stars: 5, comment: "" });
  await rateOrganizer({ userId: "teamer", tournamentId: t.id, stars: 3, comment: "" });

  // ---- the average ----
  let sum = await getRatingSummary(org.id);
  ok("average and count (4,2,5,3 → 3.5)", sum.count === 4 && sum.average === 3.5);
  ok("distribution", sum.distribution.find((d) => d.stars === 5)?.count === 1 && sum.distribution.find((d) => d.stars === 2)?.count === 1 && sum.distribution.find((d) => d.stars === 1)?.count === 0);
  ok("recent lists comments with the rater's name", sum.recent.some((r) => r.rater === "p2" && r.comment === "Prizes were never sent"));

  // ---- hiding ----
  const bad = sum.recent.find((r) => r.rater === "p2")!;
  ok("hiding needs a reason", code(await setRatingHidden({ adminId: "adm", ratingId: bad.id, hidden: true, reason: " " })) === "validation_error");
  ok("hide works", "data" in (await setRatingHidden({ adminId: "adm", ratingId: bad.id, hidden: true, reason: "Rated the wrong event" })));
  sum = await getRatingSummary(org.id);
  ok("hidden rating leaves the average (4,5,3 → 4)", sum.count === 3 && sum.average === 4 && sum.hiddenCount === 1);
  ok("hidden one is still listed for admins, marked", sum.recent.find((r) => r.id === bad.id)?.hidden === true);
  await rateOrganizer({ userId: "p2", tournamentId: t.id, stars: 1, comment: "I edited it after being hidden" });
  ok("editing a hidden rating doesn't bring it back", (await getRatingSummary(org.id)).count === 3);
  ok("restoring works", "data" in (await setRatingHidden({ adminId: "adm", ratingId: bad.id, hidden: false })) && (await getRatingSummary(org.id)).count === 4);
  ok("hide and restore are logged", (await prisma.adminActionLog.count({ where: { action: { in: ["hid_rating", "unhid_rating"] }, targetId: org.id } })) === 2);
  ok("unknown rating", code(await setRatingHidden({ adminId: "adm", ratingId: "nope", hidden: true, reason: "xxx" })) === "not_found");

  // ---- the admin's organization page ----
  const d = await getOrganizationDetail(org.id);
  ok("detail carries the ratings", d?.ratings.count === 4 && d.ratings.average === 3.3 && d.ratings.recent.length === 4);

  // ---- per-day limit ----
  const many = await Promise.all(Array.from({ length: RATINGS_PER_DAY + 1 }, (_, i) => mkT(`bulk${i}`, "completed")));
  for (const m of many) await reg(m.id, "p5");
  let last: unknown = null;
  let allowed = 0;
  for (const m of many) { last = await rateOrganizer({ userId: "p5", tournamentId: m.id, stars: 5, comment: "" }); if (!code(last)) allowed++; }
  ok(`${RATINGS_PER_DAY} ratings in a day are allowed, the next is refused`, allowed === RATINGS_PER_DAY && code(last) === "rate_limited");

  // ---- the feature switch ----
  const before = (await getRatingSummary(org.id)).count;
  await prisma.siteSettings.upsert({ where: { id: "singleton" }, update: { organizerRatingsEnabled: false }, create: { id: "singleton", organizerRatingsEnabled: false } });
  ok("switched off: no new ratings", code(await rateOrganizer({ userId: "p4", tournamentId: t.id, stars: 5, comment: "" })) === "feature_off");
  ok("switched off: existing ratings stay visible to admins", (await getRatingSummary(org.id)).count === before && before > 0);

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
