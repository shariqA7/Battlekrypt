// The player's own view of their entry (position, payment due, withdraw preview, other open slots).
import { prisma } from "../lib/prisma";
import { registerForTournament } from "../lib/services/tournaments";
import { getMyEntry } from "../lib/services/my-entry";
import { refreshSeats } from "../lib/services/rooms";
import { withdrawEntry } from "../lib/services/withdrawals";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const HOUR = 3_600_000;
let counter = 0;

async function main() {
  await prisma.user.create({ data: { id: "org", email: "org@x.com", displayName: "Org", kycStatus: "approved" } });
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "OrgCo", limitsLifted: true } });
  const game = (await prisma.game.findUnique({ where: { name: "PUBG Mobile" } }))!;
  const otherGame = (await prisma.game.findUnique({ where: { name: "Free Fire" } }))!;
  async function player() {
    const k = ++counter;
    await prisma.user.create({ data: { id: `u${k}`, email: `u${k}@x.com`, displayName: `Player ${k}` } });
    const p = await prisma.playerProfile.create({ data: { userId: `u${k}`, birthDate: new Date("2000-01-01") } });
    return { playerId: p.id, userId: `u${k}` };
  }
  const T = (name: string, o: Record<string, unknown> = {}) => prisma.tournament.create({
    data: {
      slug: name.toLowerCase().replace(/\W+/g, "-"), name, organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo",
      maxTeams: 1, format: "single_elimination", entryType: "free", status: "registration_open", startAt: new Date(Date.now() + 24 * HOUR), ...o,
    } as never,
  });

  const main1 = await T("Main room", { entryType: "paid", entryFeeAmount: 300, entryFeeCurrency: "PKR", refundPolicy: "full_before_cutoff", refundCutoffHours: 6 });
  const a = await player(), b = await player(), c = await player();
  const proof = { paymentProofUrl: "https://example.com/p.png", paymentReference: "TXN123456" };
  await registerForTournament({ tournamentId: main1.id, playerId: a.playerId, ...proof } as never);
  await registerForTournament({ tournamentId: main1.id, playerId: b.playerId } as never); // queue
  await registerForTournament({ tournamentId: main1.id, playerId: c.playerId } as never); // queue

  // other slots of the same game
  await T("Later room", { maxTeams: 5, startAt: new Date(Date.now() + 48 * HOUR) });
  await T("Full room", { maxTeams: 1, startAt: new Date(Date.now() + 30 * HOUR) });
  const fullRoom = await prisma.tournament.findFirst({ where: { name: "Full room" } });
  const filler = await player();
  await registerForTournament({ tournamentId: fullRoom!.id, playerId: filler.playerId } as never);
  await T("Past room", { maxTeams: 5, startAt: new Date(Date.now() - 5 * HOUR) });
  await T("Students only", { maxTeams: 5, audienceScope: "institution" });
  await T("Other game", { maxTeams: 5, gameId: otherGame.id });
  await T("Closed", { maxTeams: 5, status: "registration_closed" });

  const va = await getMyEntry(main1.id, a.userId);
  ok("a seated player sees their entry with no queue position", va?.entries.length === 1 && va.entries[0].status === "pending" && va.entries[0].position === null);
  ok("a seated player is not shown other slots", va?.alternatives.length === 0);
  ok("the policy sentence is included", va?.policy.text.includes("6 hours") === true && va.policy.paid);
  ok("withdraw preview: a paid seat with 24h to go and a 6h cut-off is refundable", va?.entries[0].withdraw?.refundStatus === "owed" && va.entries[0].withdraw.hadSeat === true);

  const vb = await getMyEntry(main1.id, b.userId);
  ok("first in the queue is #1 of 2", vb?.entries[0].status === "waitlisted" && vb.entries[0].position === 1 && vb.entries[0].waitingTotal === 2);
  const vc = await getMyEntry(main1.id, c.userId);
  ok("second in the queue is #2", vc?.entries[0].position === 2);
  ok("withdraw preview for a queueing team that never paid: nothing to refund", vb?.entries[0].withdraw?.refundStatus === "not_applicable" && vb.entries[0].withdraw.hadSeat === false);
  const names = vb?.alternatives.map((x) => x.name).sort().join();
  ok("a waiting player is offered only open future slots of the same game", names === "Later room");
  ok("…with the seats left", vb?.alternatives[0].seatsLeft === 5);

  const stranger = await player();
  const vs = await getMyEntry(main1.id, stranger.userId);
  ok("someone with no entry sees none", vs?.entries.length === 0 && vs.alternatives.length === 0);
  ok("an unknown tournament is null", (await getMyEntry("nope", a.userId)) === null);

  // promotion: payment due shows up
  await withdrawEntry((await prisma.registration.findFirst({ where: { tournamentId: main1.id, playerId: a.playerId } }))!.id, a.userId);
  const vb2 = await getMyEntry(main1.id, b.userId);
  ok("after a withdrawal the first in line holds a seat and must pay", vb2?.entries[0].status === "pending" && vb2.entries[0].needsPayment && vb2.entries[0].payDueAt !== null);
  const vc2 = await getMyEntry(main1.id, c.userId);
  ok("the next one moves up to #1", vc2?.entries[0].position === 1 && vc2.entries[0].waitingTotal === 1);
  const va2 = await getMyEntry(main1.id, a.userId);
  ok("the one who withdrew sees it and the refund state", va2?.entries[0].status === "withdrawn" && va2.entries[0].refund?.status === "owed" && va2.entries[0].withdraw === null);

  // the payment window passes
  await prisma.registration.updateMany({ where: { tournamentId: main1.id, playerId: b.playerId }, data: { payDueAt: new Date(Date.now() - 1000) } });
  await refreshSeats(main1.id);
  const vb3 = await getMyEntry(main1.id, b.userId);
  ok("a team whose payment window ended sees why", vb3?.entries[0].status === "withdrawn" && vb3.entries[0].releaseReason === "payment_window_expired");
  ok("…and its seat went to the next in line", (await getMyEntry(main1.id, c.userId))?.entries[0].status === "pending");

  // a team member who isn't the payer sees the entry but can't manage it
  const cap = await player(), mate = await player();
  const squad = await T("Squad", { mode: "duo", maxTeams: 3 });
  const reg = await registerForTournament({ tournamentId: squad.id, playerId: cap.playerId, teamMemberPlayerIds: [mate.playerId], teamName: "Duo" } as never);
  const vm = await getMyEntry(squad.id, mate.userId);
  const vcap = await getMyEntry(squad.id, cap.userId);
  ok("a teammate sees the team's entry", vm?.entries.length === 1 && vm.entries[0].name === "Duo" && !("error" in reg));
  ok("…but can't withdraw it", vm?.entries[0].canManage === false && vm.entries[0].withdraw === null);
  ok("the captain can", vcap?.entries[0].canManage === true && vcap.entries[0].withdraw !== null);
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
