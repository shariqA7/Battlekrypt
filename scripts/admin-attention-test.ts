// The admin "needs attention" counts (sidebar badge, Approvals sub-tab badges, dashboard cards)
// all come from getAttentionCounts(). This checks the parental-consent queue really feeds them,
// and that every counted queue is actually shown somewhere an admin will see it.
// Needs a migrated, empty Postgres (npm test provides one).
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { getAttentionCounts } from "../lib/services/admin-attention";
import { decideConsentCase, openConsentCases } from "../lib/services/consent-cases";
import { ADMIN_NAV_ITEMS, ADMIN_SUBTABS, navBadgeCount } from "../components/admin/adminNav";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

async function main() {
  const empty = await getAttentionCounts();
  ok("nothing waiting on an empty platform", empty.total === 0 && empty.items.consent === 0);

  // A running tournament with a minor whose guardian just withdrew consent.
  await prisma.user.createMany({ data: [
    { id: "aa-org", email: "aa-org@x.com", displayName: "Org", kycStatus: "approved" },
    { id: "aa-kid", email: "aa-kid@x.com", displayName: "Kid" },
  ]});
  const org = await prisma.organizerProfile.create({ data: { userId: "aa-org", orgName: "AA Org", limitsLifted: true } });
  const kid = await prisma.playerProfile.create({ data: { userId: "aa-kid", firstName: "Kid", lastName: "Player" } });
  const game = await prisma.game.create({ data: { name: "AttentionTestGame" } });
  const t = await prisma.tournament.create({ data: { organizerId: org.id, gameId: game.id, slug: "aa-t", name: "AA Cup", type: "tournament", mode: "solo", maxTeams: 8, format: "single_elimination", status: "in_progress", entryType: "free" } });
  const reg = await prisma.registration.create({ data: { tournamentId: t.id, playerId: kid.id, status: "approved" } });

  const before = (await getAttentionCounts()).total;
  await openConsentCases(kid.id, [{ id: reg.id, tournamentId: t.id }]);
  const open = await getAttentionCounts();
  ok("an open case counts in the consent queue", open.items.consent === 1);
  ok("and in the sidebar badge total", open.total === before + 1);

  const subtab = ADMIN_SUBTABS["/admin/approvals"].find((s) => s.countKey === "consent");
  ok("the Approvals sub-tab for it exists and is keyed to the same count", !!subtab && subtab.href === "/admin/approvals/consent");

  const [c] = await prisma.consentCase.findMany({ where: { registrationId: reg.id } });
  await decideConsentCase(c.id, "aa-org", "allow");
  const after = await getAttentionCounts();
  ok("deciding the case clears it from the queue", after.items.consent === 0);
  ok("and from the sidebar badge", after.total === before);

  // Wiring: a queue that is counted but never displayed is invisible work.
  const dashboard = readFileSync("app/(main)/(admin)/admin/page.tsx", "utf8");
  const tabKeys = new Set(Object.values(ADMIN_SUBTABS).flat().map((s) => s.countKey).filter(Boolean));
  for (const key of Object.keys(empty.items)) {
    ok(`the "${key}" count is shown on the dashboard or an approvals tab`, dashboard.includes(`attention.items.${key}`) || tabKeys.has(key));
  }
  // The sidebar: each item shows only what is waiting on ITS page, and together they cover
  // every counted queue exactly once. Distinct values per queue make a double count or a
  // missing queue show up as a wrong sum.
  const keys = Object.keys(empty.items);
  const distinct = Object.fromEntries(keys.map((k, i) => [k, 10 ** i]));
  const sidebarSum = ADMIN_NAV_ITEMS.reduce((n, it) => n + navBadgeCount(it, distinct), 0);
  ok("every counted queue appears on exactly one sidebar item (badges add up to the total)", sidebarSum === Object.values(distinct).reduce((a, b) => a + b, 0));
  const find = (label: string) => ADMIN_NAV_ITEMS.find((i) => i.label === label)!;
  ok("only a change request is waiting: Change requests lights up, Approvals does not", navBadgeCount(find("Change requests"), { changeRequests: 3 }) === 3 && navBadgeCount(find("Approvals"), { changeRequests: 3 }) === 0);
  ok("only an institution is waiting: Institutions lights up, Approvals does not", navBadgeCount(find("Institutions"), { institutions: 2 }) === 2 && navBadgeCount(find("Approvals"), { institutions: 2 }) === 0);
  ok("a parental-consent case lights up Approvals", navBadgeCount(find("Approvals"), { consent: 1 }) === 1);
  ok("Approvals adds up all of its tabs", navBadgeCount(find("Approvals"), { organizers: 1, clubs: 2, games: 4, consent: 8 }) === 15);
  ok("items without a badge show nothing", navBadgeCount(find("Users"), distinct) === 0 && navBadgeCount(find("Dashboard"), distinct) === 0);
  ok("a missing count is treated as zero", navBadgeCount(find("Approvals"), {}) === 0);
  ok("the layout passes the per-queue counts to the sidebar", readFileSync("app/(main)/(admin)/admin/layout.tsx", "utf8").includes("getAttentionCounts") && readFileSync("app/(main)/(admin)/admin/layout.tsx", "utf8").includes("counts={counts}"));
}
main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); console.log(fails ? `\n${fails} FAILED` : "\nAll passed"); process.exit(fails ? 1 : 0); });
