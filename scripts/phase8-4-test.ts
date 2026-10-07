// Needs a Postgres with all migrations applied. See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { publishTournament, updateTournament, getRoomForPlayer } from "../lib/services/tournaments";
import { toPublicTournament } from "../lib/services/venue";
import {
  updateStageVenue, advanceToStage, removeFromStage, getMyStageCheckIn, stageSelfCheckIn,
  setStageEntryCheckIn, stageCheckInCounts, listStageEntries,
} from "../lib/services/stages";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const mins = (n: number) => new Date(Date.now() + n * 60000);

async function main() {
  await prisma.user.createMany({ data: [
    { id: "org", email: "org@x.com", displayName: "Org", kycStatus: "approved" },
    { id: "oth", email: "oth@x.com", displayName: "Other" },
    ...["a", "b", "c", "d"].map((x) => ({ id: x, email: `${x}@x.com`, displayName: x.toUpperCase() })),
  ]});
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "OrgCo" } });
  const other = await prisma.organizerProfile.create({ data: { userId: "oth", orgName: "Other" } });
  const pl: Record<string, string> = {};
  for (const x of ["a", "b", "c", "d"]) pl[x] = (await prisma.playerProfile.create({ data: { userId: x } })).id;
  const game = await prisma.game.create({ data: { name: "G" } });
  const base = { organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 20, format: "single_elimination", entryType: "free" } as const;
  const hyb = await prisma.tournament.create({ data: { ...base, slug: "hyb", name: "Hyb", venueType: "hybrid" } });
  const plain = await prisma.tournament.create({ data: { ...base, slug: "plain", name: "Plain", venueType: "online" } });
  const q = await prisma.stage.create({ data: { tournamentId: hyb.id, name: "Qualifiers", order: 0, roomId: "QR", roomPassword: "QPW", roomRevealAt: mins(-5) } });
  const semi = await prisma.stage.create({ data: { tournamentId: hyb.id, name: "Semis", order: 1, roomId: "SR", roomPassword: "SPW", roomRevealAt: mins(-5) } });
  const fin = await prisma.stage.create({ data: { tournamentId: hyb.id, name: "Finals", order: 2 } });
  const plainStage = await prisma.stage.create({ data: { tournamentId: plain.id, name: "S", order: 0 } });

  // ---- publish rules
  ok("hybrid with only online stages cannot publish", err(await publishTournament(hyb.id, org.id)) === "venue_incomplete");
  ok("only hybrid tournaments can set stage venues", err(await updateStageVenue(plainStage.id, org.id, { venueType: "lan" })) === "not_hybrid");
  ok("other organizer forbidden", err(await updateStageVenue(fin.id, other.id, { venueType: "lan" })) === "forbidden");
  ok("a stage can't be 'hybrid'", err(await updateStageVenue(fin.id, org.id, { venueType: "hybrid" })) === "validation");
  ok("bad check-in window rejected", err(await updateStageVenue(fin.id, org.id, { venueType: "lan", checkInOpensAt: mins(60), checkInClosesAt: mins(30) })) === "validation");
  ok("lan stage without venue still blocks publish", !err(await updateStageVenue(fin.id, org.id, { venueType: "lan" })) && err(await publishTournament(hyb.id, org.id)) === "venue_incomplete");
  ok("complete lan stage saved", !err(await updateStageVenue(fin.id, org.id, { venueName: "Arena", venueAddress: "1 Main", venueCity: "Lahore", checkInOpensAt: mins(-30), checkInClosesAt: mins(90) })));
  const f1 = (await prisma.stage.findUnique({ where: { id: fin.id } }))!;
  ok("lan stage gets a code, is restricted, has no room", /^[A-HJ-NP-Z2-9]{6}$/.test(f1.checkInCode ?? "") && f1.restricted && f1.roomId === null);
  ok("hybrid with online + complete lan stage publishes", !err(await publishTournament(hyb.id, org.id)));

  // ---- registrations
  const reg: Record<string, string> = {};
  for (const [x, pts] of [["a", 90], ["b", 70], ["c", 50]] as const) {
    reg[x] = (await prisma.registration.create({ data: { tournamentId: hyb.id, playerId: pl[x], status: "approved", paymentStatus: "waived", points: pts } })).id;
  }
  reg.d = (await prisma.registration.create({ data: { tournamentId: hyb.id, playerId: pl.d, status: "pending", paymentStatus: "waived" } })).id;
  const foreign = (await prisma.registration.create({ data: { tournamentId: plain.id, playerId: pl.a, status: "approved", paymentStatus: "waived" } })).id;

  // ---- advancement
  ok("pending entry cannot advance", err(await advanceToStage(semi.id, org.id, { registrationIds: [reg.d] })) === "invalid_entries");
  ok("entry from another tournament cannot advance", err(await advanceToStage(semi.id, org.id, { registrationIds: [foreign] })) === "invalid_entries");
  ok("other organizer cannot advance", err(await advanceToStage(semi.id, other.id, { registrationIds: [reg.a] })) === "forbidden");
  ok("nothing chosen is rejected", err(await advanceToStage(semi.id, org.id, {})) === "validation");
  const top2 = await advanceToStage(semi.id, org.id, { top: 2 });
  ok("top 2 by points advanced (a,b)", "data" in top2 && top2.data.added === 2 && (await prisma.stageEntry.count({ where: { stageId: semi.id, registrationId: { in: [reg.a, reg.b] } } })) === 2);
  const again = await advanceToStage(semi.id, org.id, { top: 2 });
  ok("advancing again adds nothing new", "data" in again && again.data.added === 0);
  ok("explicit advance adds the rest", "data" in (await advanceToStage(semi.id, org.id, { registrationIds: [reg.c] })));
  ok("remove works", "data" in (await removeFromStage(semi.id, org.id, reg.c)) && (await prisma.stageEntry.count({ where: { stageId: semi.id } })) === 2);
  ok("finals: advance a and b", !err(await advanceToStage(fin.id, org.id, { registrationIds: [reg.a, reg.b] })));

  // ---- room access
  ok("unrestricted online stage: everyone approved sees room", "data" in (await getRoomForPlayer(q.id, pl.c)));
  await updateStageVenue(semi.id, org.id, { venueType: "online", restricted: true });
  ok("restricted stage: advanced player sees room", "data" in (await getRoomForPlayer(semi.id, pl.a)));
  ok("restricted stage: non-advanced player refused", err(await getRoomForPlayer(semi.id, pl.c)) === "not_advanced");
  ok("lan stage of a hybrid: no room credentials", err(await getRoomForPlayer(fin.id, pl.a)) === "lan_no_room");

  // ---- public sanitizer
  const full = await prisma.tournament.findUnique({ where: { id: hyb.id }, include: { stages: true } });
  const pub = JSON.stringify(toPublicTournament(full!));
  ok("public view hides stage check-in code and room secrets", !pub.includes(f1.checkInCode!) && !pub.includes("QPW") && !pub.includes("SPW") && !pub.includes("SR\""));
  ok("public view keeps stage venue", pub.includes("Arena") && pub.includes("Lahore"));

  // ---- stage check-in
  ok("not-approved entrant sees nothing", (await getMyStageCheckIn(fin.id, pl.d)) === null);
  const cNo = await getMyStageCheckIn(fin.id, pl.c);
  ok("approved but not advanced: advanced=false", !!cNo && cNo.advanced === false);
  ok("online stage has no check-in state", (await getMyStageCheckIn(q.id, pl.a)) === null);
  ok("not advanced can't check in", err(await stageSelfCheckIn(fin.id, pl.c, f1.checkInCode!)) === "not_advanced");
  ok("wrong code rejected + counted", err(await stageSelfCheckIn(fin.id, pl.a, "ZZZZZZ")) === "wrong_code");
  const good = await stageSelfCheckIn(fin.id, pl.a, ` ${f1.checkInCode!.toLowerCase()} `);
  ok("right code checks in", "data" in good && good.data.status === "checked_in");
  const aState = await getMyStageCheckIn(fin.id, pl.a);
  ok("state shows checked in", !!aState && aState.advanced === true && aState.status === "checked_in");
  const eB = (await prisma.stageEntry.findFirst({ where: { stageId: fin.id, registrationId: reg.b } }))!;
  for (let i = 0; i < 5; i++) await stageSelfCheckIn(fin.id, pl.b, "BADBAD");
  ok("5 wrong codes lock self check-in", err(await stageSelfCheckIn(fin.id, pl.b, f1.checkInCode!)) === "locked");
  ok("organizer check-in works when locked and clears the lock", !err(await setStageEntryCheckIn(eB.id, org.id, "checked_in")) && (await prisma.stageEntry.findUnique({ where: { id: eB.id } }))?.checkInAttempts === 0);
  ok("other organizer forbidden", err(await setStageEntryCheckIn(eB.id, other.id, "no_show")) === "forbidden");
  const semiEntry = (await prisma.stageEntry.findFirst({ where: { stageId: semi.id } }))!;
  ok("online stage entries can't be checked in", err(await setStageEntryCheckIn(semiEntry.id, org.id, "checked_in")) === "not_lan");
  const cnt = await stageCheckInCounts(fin.id);
  ok("counts", cnt.checkedIn === 2 && cnt.noShow === 0 && cnt.pending === 0);
  ok("listStageEntries returns every stage's entries", (await listStageEntries(hyb.id)).length === 4);

  // window
  await prisma.stage.update({ where: { id: fin.id }, data: { checkInOpensAt: mins(30), checkInClosesAt: mins(90) } });
  await setStageEntryCheckIn(eB.id, org.id, "pending");
  ok("before window: not_open", err(await stageSelfCheckIn(fin.id, pl.b, f1.checkInCode!)) === "not_open");
  await prisma.stage.update({ where: { id: fin.id }, data: { checkInOpensAt: mins(-90), checkInClosesAt: mins(-30) } });
  ok("after window: window_closed", err(await stageSelfCheckIn(fin.id, pl.b, f1.checkInCode!)) === "window_closed");

  // changing a stage's type after check-in is blocked
  ok("lan stage type locked once someone checked in", err(await updateStageVenue(fin.id, org.id, { venueType: "online" })) === "stage_locked");

  // ---- tournament-level rules
  ok("hybrid <-> other locked once registered", err(await updateTournament(hyb.id, org.id, { venueType: "online" })) === "venue_locked");
  const empty = await prisma.tournament.create({ data: { ...base, slug: "empty", name: "Empty", venueType: "hybrid" } });
  const es = await prisma.stage.create({ data: { tournamentId: empty.id, name: "E", order: 0 } });
  await updateStageVenue(es.id, org.id, { venueType: "lan", venueName: "V", venueAddress: "A", venueCity: "C" });
  ok("unregistered hybrid can switch away; stages reset", !err(await updateTournament(empty.id, org.id, { venueType: "online" })));
  const es2 = (await prisma.stage.findUnique({ where: { id: es.id } }))!;
  ok("stage back to plain online, code and restriction cleared", es2.venueType === "online" && es2.checkInCode === null && es2.venueName === null && es2.restricted === false);
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
