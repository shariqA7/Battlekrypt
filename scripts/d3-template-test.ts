// Needs a Postgres with all migrations applied (incl. 20261014000000_template_prize_tiers).
// See phase8-1-test.ts for how to run. Uses two organizers because the free plan
// allows one saved template each.
import { prisma } from "../lib/prisma";
import { createTournament, updateTournament } from "../lib/services/tournaments";
import { createTemplateFromTournament, getTemplatePrefill, deleteTemplate } from "../lib/services/templates";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const fmt = (t: { positionFrom: number; positionTo: number; amount: unknown }[]) => t.map((x) => `${x.positionFrom}-${x.positionTo}:${Number(x.amount)}`).join(" ");

// The prefill's data, or null if it was an error result.
async function prefillOf(id: string, organizerId: string) {
  const r = await getTemplatePrefill(id, organizerId);
  return "data" in r ? r.data : null;
}

async function main() {
  await prisma.user.createMany({ data: [
    { id: "orgA", email: "a@x.com", displayName: "A", kycStatus: "approved" },
    { id: "orgB", email: "b@x.com", displayName: "B", kycStatus: "approved" },
  ]});
  const a = await prisma.organizerProfile.create({ data: { userId: "orgA", orgName: "A Co" } });
  const b = await prisma.organizerProfile.create({ data: { userId: "orgB", orgName: "B Co" } });
  const game = await prisma.game.create({ data: { name: "G" } });
  const base = { gameId: game.id, type: "tournament", mode: "solo", maxTeams: 20, format: "single_elimination", entryType: "free" } as const;

  // A: tournament with a pool and a split -> template
  const t1 = await createTournament({ ...base, organizerId: a.id, name: "T1", prizePoolAmount: 1000, prizePoolCurrency: "USD", prizeTiers: [
    { from: 1, to: 1, amount: 500 }, { from: 2, to: 2, amount: 250 }, { from: 3, to: 4, amount: 125 },
  ] });
  const saved = await createTemplateFromTournament(t1.id, a.id, "With split");
  ok("template saved", !err(saved));
  const tplId = (saved as { data: { id: string } }).data.id;
  ok("split rows stored on the template", (await prisma.templatePrizeTier.count({ where: { templateId: tplId } })) === 3);

  const prefill = await prefillOf(tplId, a.id);
  ok("prefill carries the split in order", !!prefill && fmt(prefill.prizeTiers) === "1-1:500 2-2:250 3-4:125");

  // snapshot rule: changing the tournament afterwards leaves the template alone
  await updateTournament(t1.id, a.id, { prizeTiers: [{ from: 1, to: 1, amount: 1000 }] });
  const after = await prefillOf(tplId, a.id);
  ok("editing the tournament later doesn't change the template", !!after && fmt(after.prizeTiers) === "1-1:500 2-2:250 3-4:125");

  // the prefilled split is valid for a brand-new tournament
  const p = after!;
  const t3 = await createTournament({ ...base, organizerId: a.id, name: "T3", prizePoolAmount: p.prizePool!.amount, prizePoolCurrency: p.prizePool!.currency,
    prizeTiers: p.prizeTiers.map((x) => ({ from: x.positionFrom, to: x.positionTo, amount: x.amount })) });
  ok("a tournament created from the prefill keeps the split", !err(t3) && (await prisma.prizeTier.count({ where: { tournamentId: (t3 as { id: string }).id } })) === 3);

  // B: pool but no split -> empty list, not an error
  const t2 = await createTournament({ ...base, organizerId: b.id, name: "T2", prizePoolAmount: 300, prizePoolCurrency: "USD" });
  const savedB = await createTemplateFromTournament(t2.id, b.id, "No split");
  const prefillB = await prefillOf((savedB as { data: { id: string } }).data.id, b.id);
  ok("template without a split prefills an empty list", !!prefillB && prefillB.prizeTiers.length === 0);

  // another organizer can't read it
  ok("someone else's template is still forbidden", err(await getTemplatePrefill(tplId, b.id)) === "forbidden");

  // deleting the template removes its split rows
  await deleteTemplate(tplId, a.id);
  ok("split rows cascade-delete with the template", (await prisma.templatePrizeTier.count({ where: { templateId: tplId } })) === 0);
}
main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
