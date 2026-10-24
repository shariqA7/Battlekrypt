// Needs a Postgres with all migrations applied. See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { createTournament, updateTournament, getTournamentById } from "../lib/services/tournaments";
import { toPublicTournament } from "../lib/services/venue";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const tiers = (t: { positionFrom: number; positionTo: number; amount: unknown }[]) => t.map((x) => `${x.positionFrom}-${x.positionTo}:${Number(x.amount)}`).join(" ");

async function main() {
  await prisma.user.createMany({ data: [
    { id: "org", email: "org@x.com", displayName: "Org", kycStatus: "approved" },
    { id: "p1", email: "p1@x.com", displayName: "P1" },
  ]});
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "OrgCo", limitsLifted: true } });
  const p1 = await prisma.playerProfile.create({ data: { birthDate: new Date("2000-01-01"), userId: "p1" } });
  const game = await prisma.game.create({ data: { name: "G" } });
  const base = { organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 20, format: "single_elimination", entryType: "free" } as const;

  // create with a split
  const t = await createTournament({ ...base, name: "T1", prizePoolAmount: 1500000, prizePoolCurrency: "USD", prizeTiers: [
    { from: 1, to: 1, amount: 750000 }, { from: 2, to: 2, amount: 350000 }, { from: 3, to: 3, amount: 150000 }, { from: 4, to: 8, amount: 50000 },
  ] });
  const full = await getTournamentById(t.id);
  ok("split saved and returned in order", tiers(full!.prizeTiers) === "1-1:750000 2-2:350000 3-3:150000 4-8:50000");
  ok("public view carries the split", toPublicTournament(full!).prizeTiers.length === 4);

  // update: replace (the split must add up to the whole pool: 3 places x 500,000 = 1,500,000)
  ok("replace the split", !err(await updateTournament(t.id, org.id, { prizeTiers: [{ from: 1, to: 3, amount: 500000 }] })));
  ok("old rows are gone, new ones in", tiers((await getTournamentById(t.id))!.prizeTiers) === "1-3:500000");
  ok("a split that leaves part of the pool unassigned is refused", err(await updateTournament(t.id, org.id, { prizeTiers: [{ from: 1, to: 3, amount: 100000 }] })) === "invalid_prize_tiers");
  // update: pool shrinks below the split
  ok("lowering the pool under the split is refused", err(await updateTournament(t.id, org.id, { prizePoolAmount: 200000 })) === "invalid_prize_tiers");
  ok("…and nothing changed", Number((await getTournamentById(t.id))!.prizePoolAmount) === 1500000);
  ok("a split that exceeds the pool is refused", err(await updateTournament(t.id, org.id, { prizeTiers: [{ from: 1, to: 1, amount: 1500001 }] })) === "invalid_prize_tiers");
  ok("exactly the pool is fine", !err(await updateTournament(t.id, org.id, { prizeTiers: [{ from: 1, to: 1, amount: 1500000 }] })));
  ok("editing other fields keeps the split", !err(await updateTournament(t.id, org.id, { name: "T1b" })) && tiers((await getTournamentById(t.id))!.prizeTiers) === "1-1:1500000");

  // lock once anyone registered
  await prisma.registration.create({ data: { tournamentId: t.id, playerId: p1.id, status: "approved", paymentStatus: "waived" } });
  ok("changing the split after registrations is locked", err(await updateTournament(t.id, org.id, { prizeTiers: [{ from: 1, to: 2, amount: 100 }] })) === "prize_locked");
  ok("resending the same split is fine", !err(await updateTournament(t.id, org.id, { prizeTiers: [{ from: 1, to: 1, amount: 1500000 }] })));

  // clear
  const t2 = await prisma.tournament.create({ data: { ...base, slug: "t2", name: "T2", prizePoolAmount: 1000, prizePoolCurrency: "PKR" } });
  ok("no pool, no split", err(await updateTournament((await prisma.tournament.create({ data: { ...base, slug: "t3", name: "T3" } })).id, org.id, { prizeTiers: [{ from: 1, to: 1, amount: 5 }] })) === "invalid_prize_tiers");
  ok("set a split on a plain tournament", !err(await updateTournament(t2.id, org.id, { prizeTiers: [{ from: 1, to: 1, amount: 600 }, { from: 2, to: 2, amount: 400 }] })));
  // a pool needs a split: clearing every place while the pool is still there is refused, and nothing changes
  ok("clearing the split while a pool remains is refused", err(await updateTournament(t2.id, org.id, { prizeTiers: [] })) === "invalid_prize_tiers" && (await getTournamentById(t2.id))!.prizeTiers.length === 2);
  // deleting a tournament's split cascades with the tournament
  await prisma.prizeTier.create({ data: { tournamentId: t2.id, positionFrom: 1, positionTo: 1, amount: 1 } });
  await prisma.tournament.delete({ where: { id: t2.id } });
  ok("split rows cascade-delete with the tournament", (await prisma.prizeTier.count({ where: { tournamentId: t2.id } })) === 0);
}
main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
