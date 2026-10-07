// Needs a Postgres with all migrations applied. See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { createTournament, publishTournament, updateTournament, getRoomForPlayer, registerForTournament, listTournaments } from "../lib/services/tournaments";
import { selfCheckIn, setCheckInStatus, getMyCheckIn, checkInCounts, toPublicTournament, generateCheckInCode } from "../lib/services/venue";
import { parseVenue } from "../lib/venue-input";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const mins = (n: number) => new Date(Date.now() + n * 60000);

async function main() {
  await prisma.user.createMany({ data: [
    { id: "org", email: "org@x.com", displayName: "Org", kycStatus: "approved" },
    { id: "p1", email: "p1@x.com", displayName: "P1" },
    { id: "p2", email: "p2@x.com", displayName: "P2" },
    { id: "p3", email: "p3@x.com", displayName: "P3" },
  ]});
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "OrgCo" } });
  const org2 = await prisma.organizerProfile.create({ data: { userId: "p3", orgName: "Other" } });
  const p1 = await prisma.playerProfile.create({ data: { userId: "p1" } });
  const p2 = await prisma.playerProfile.create({ data: { userId: "p2" } });
  const game = await prisma.game.create({ data: { name: "G" } });
  const base = { organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 20, format: "single_elimination", entryType: "free" } as const;

  // validation helper
  ok("parseVenue rejects bad type", !parseVenue({ venueType: "moon" }).ok);
  ok("parseVenue rejects close<=open", !parseVenue({ checkInOpensAt: "2030-01-02T10:00:00Z", checkInClosesAt: "2030-01-02T09:00:00Z" }).ok);
  ok("parseVenue rejects junk date", !parseVenue({ checkInOpensAt: "nope" }).ok);

  // creation
  const online = await createTournament({ ...base, name: "On" });
  ok("online: no check-in code, no venue", online.venueType === "online" && online.checkInCode === null && online.venueName === null);
  const lan = await createTournament({ ...base, name: "Lan", venueType: "lan", venueName: " Arena ", venueAddress: "1 Main St", venueCity: "Lahore", checkInOpensAt: mins(-10), checkInClosesAt: mins(60) });
  ok("lan: venue trimmed + 6-char code generated", lan.venueName === "Arena" && /^[A-HJ-NP-Z2-9]{6}$/.test(lan.checkInCode ?? ""));
  ok("code alphabet has no ambiguous chars over 200 samples", Array.from({ length: 200 }, () => generateCheckInCode()).every((c) => !/[01OI]/.test(c)));

  // publish needs a complete venue
  const bare = await createTournament({ ...base, name: "Bare", venueType: "lan" });
  ok("lan without venue cannot publish", err(await publishTournament(bare.id, org.id)) === "venue_incomplete");
  ok("lan with venue publishes", !err(await publishTournament(lan.id, org.id)));
  ok("online publishes unchanged", !err(await publishTournament(online.id, org.id)));

  // public sanitizer
  const full = await prisma.tournament.findUnique({ where: { id: lan.id }, include: { stages: true } });
  await prisma.stage.create({ data: { tournamentId: online.id, name: "Q", order: 0, roomId: "R123", roomPassword: "SECRET", roomRevealAt: mins(-1) } });
  const onFull = await prisma.tournament.findUnique({ where: { id: online.id }, include: { stages: true } });
  const pubLan = toPublicTournament(full!) as Record<string, unknown>;
  const pubOn = toPublicTournament(onFull!);
  ok("public view hides check-in code", !("checkInCode" in pubLan) && JSON.stringify(pubLan).indexOf(lan.checkInCode!) === -1);
  ok("public view hides room credentials, keeps hasRoom", !JSON.stringify(pubOn).includes("SECRET") && !JSON.stringify(pubOn).includes("R123") && pubOn.stages[0].hasRoom === true);

  // room reveal: online still works, LAN returns lan_no_room
  await registerForTournament({ tournamentId: online.id, playerId: p1.id });
  await prisma.registration.updateMany({ where: { tournamentId: online.id }, data: { status: "approved" } });
  const stageOn = await prisma.stage.findFirst({ where: { tournamentId: online.id } });
  const room = await getRoomForPlayer(stageOn!.id, p1.id);
  ok("online room reveal still works", "data" in room && room.data?.roomId === "R123");
  const stageLan = await prisma.stage.create({ data: { tournamentId: lan.id, name: "Finals", order: 0, roomId: "X", roomRevealAt: mins(-1) } });
  await prisma.registration.create({ data: { tournamentId: lan.id, playerId: p1.id, status: "approved", paymentStatus: "waived" } });
  ok("lan: room reveal refused", err(await getRoomForPlayer(stageLan.id, p1.id)) === "lan_no_room");

  // self check-in
  const reg = (await prisma.registration.findFirst({ where: { tournamentId: lan.id, playerId: p1.id } }))!;
  const code = lan.checkInCode!;
  ok("my check-in state is visible to the approved player", (await getMyCheckIn(lan.id, p1.id))?.status === "pending");
  ok("no check-in state for a non-registered player", (await getMyCheckIn(lan.id, p2.id)) === null);
  ok("no check-in state on online tournaments", (await getMyCheckIn(online.id, p1.id)) === null);
  ok("non-registered player cannot check in", err(await selfCheckIn(lan.id, p2.id, code)) === "not_registered");
  ok("online tournament has no check-in", err(await selfCheckIn(online.id, p1.id, "X")) === "not_lan");
  ok("wrong code rejected", err(await selfCheckIn(lan.id, p1.id, "ZZZZZZ")) === "wrong_code");
  ok("wrong attempt counted", (await prisma.registration.findUnique({ where: { id: reg.id } }))?.checkInAttempts === 1);
  const good = await selfCheckIn(lan.id, p1.id, ` ${code.toLowerCase()} `);
  ok("right code (any case, padded) checks in", "data" in good && good.data.status === "checked_in");
  const after = await prisma.registration.findUnique({ where: { id: reg.id } });
  ok("checkedInAt stored", after?.checkInStatus === "checked_in" && after.checkedInAt !== null);
  ok("checking in twice is harmless", "data" in (await selfCheckIn(lan.id, p1.id, "WRONG1")));

  // lockout after 5 wrong tries
  await setCheckInStatus(reg.id, org.id, "pending");
  ok("organizer undo resets to pending", (await prisma.registration.findUnique({ where: { id: reg.id } }))?.checkInStatus === "pending");
  for (let i = 0; i < 5; i++) await selfCheckIn(lan.id, p1.id, "BADBAD");
  ok("5 wrong codes lock self check-in", err(await selfCheckIn(lan.id, p1.id, code)) === "locked");
  ok("lock is visible to the player UI", (await getMyCheckIn(lan.id, p1.id))?.locked === true);
  ok("organizer check-in still works when locked", !err(await setCheckInStatus(reg.id, org.id, "checked_in")));
  ok("organizer decision clears the lockout counter", (await prisma.registration.findUnique({ where: { id: reg.id } }))?.checkInAttempts === 0);

  // window
  // (createTournament is capped by the free plan at 3 a month, so build the rest directly)
  const early = await prisma.tournament.create({ data: { ...base, slug: "early-t", name: "Early", venueType: "lan", venueName: "A", venueAddress: "B", venueCity: "C", checkInOpensAt: mins(30), checkInClosesAt: mins(90), checkInCode: generateCheckInCode() } });
  await prisma.tournament.update({ where: { id: early.id }, data: { status: "published" } });
  await prisma.registration.create({ data: { tournamentId: early.id, playerId: p1.id, status: "approved", paymentStatus: "waived" } });
  ok("before the window: not_open", err(await selfCheckIn(early.id, p1.id, early.checkInCode!)) === "not_open");
  await prisma.tournament.update({ where: { id: early.id }, data: { checkInOpensAt: mins(-90), checkInClosesAt: mins(-30) } });
  ok("after the window: window_closed", err(await selfCheckIn(early.id, p1.id, early.checkInCode!)) === "window_closed");
  const eReg = (await prisma.registration.findFirst({ where: { tournamentId: early.id } }))!;
  ok("organizer can still check in after the window", !err(await setCheckInStatus(eReg.id, org.id, "checked_in")));

  // organizer permissions + states
  ok("other organizer forbidden", err(await setCheckInStatus(reg.id, org2.id, "no_show")) === "forbidden");
  const pend = await prisma.registration.create({ data: { tournamentId: lan.id, playerId: p2.id, status: "pending" } });
  ok("only approved entries can check in", err(await setCheckInStatus(pend.id, org.id, "checked_in")) === "not_approved");
  const onReg = await prisma.registration.findFirst({ where: { tournamentId: online.id } });
  ok("online registrations have no check-in", err(await setCheckInStatus(onReg!.id, org.id, "checked_in")) === "not_lan");
  await prisma.registration.update({ where: { id: pend.id }, data: { status: "approved" } });
  ok("no-show + counts", !err(await setCheckInStatus(pend.id, org.id, "no_show")));
  const c = await checkInCounts(lan.id);
  ok("counts add up", c.checkedIn === 1 && c.noShow === 1 && c.pending === 0);

  // editing rules
  ok("online->lan blocked once registrations exist", err(await updateTournament(online.id, org.id, { venueType: "lan" })) === "venue_locked");
  ok("lan->online blocked once registrations exist", err(await updateTournament(lan.id, org.id, { venueType: "online" })) === "venue_locked");
  ok("venue details can still be corrected", !err(await updateTournament(lan.id, org.id, { venueAddress: "2 Main St" })));
  ok("correction saved, code untouched", (await prisma.tournament.findUnique({ where: { id: lan.id } }))?.venueAddress === "2 Main St" && (await prisma.tournament.findUnique({ where: { id: lan.id } }))?.checkInCode === code);
  ok("bad window rejected on edit", err(await updateTournament(lan.id, org.id, { checkInOpensAt: mins(100), checkInClosesAt: mins(50) })) === "invalid_check_in_window");
  const empty = await prisma.tournament.create({ data: { ...base, slug: "empty-t", name: "Empty" } });
  ok("empty tournament can switch to lan and gets a code", !err(await updateTournament(empty.id, org.id, { venueType: "lan", venueName: "V", venueAddress: "A", venueCity: "C" })) && !!(await prisma.tournament.findUnique({ where: { id: empty.id } }))?.checkInCode);
  await updateTournament(empty.id, org.id, { venueType: "online" });
  const back = await prisma.tournament.findUnique({ where: { id: empty.id } });
  ok("switching back to online clears venue and code", back?.venueName === null && back.checkInCode === null && back.checkInOpensAt === null);

  // browse filter
  const lanOnly = await listTournaments({ venueType: "lan" });
  ok("venue filter", lanOnly.data.length >= 1 && lanOnly.data.every((t) => t.venueType === "lan"));
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
