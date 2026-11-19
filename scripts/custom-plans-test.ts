// Separate monthly limits (tournaments / leagues / scrims), creating plans, private plans, and the
// "Customize your plan" request flow. Needs a Postgres with all migrations applied (see phase8-1-test.ts).
import { prisma } from "../lib/prisma";
import { PlanLimitError } from "../lib/services/plan-gates";
import { createTournament } from "../lib/services/tournaments";
import { createPlan, listPlans } from "../lib/services/plan-requests";
import { previewPlanChange, getPlanChangeView } from "../lib/services/plan-changes";
import { resolvePlan } from "../lib/plans";
import {
  submitCustomPlanRequest, listCustomRequestsForAdmin, quoteCustomRequest, closeCustomRequest,
  countOpenCustomRequests, getMyCustomRequests,
} from "../lib/services/custom-plans";
import { completeOrganizerLimits, validateCustomRequest, organizerPlanDefaults, MAX_OPEN_CUSTOM_REQUESTS } from "../lib/custom-plan-rules";
import { describeLimits } from "../lib/plan-copy";
import { hasAccess } from "../lib/staff-permissions";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const code = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);

async function main() {
  // ---- the rules (no database) ----
  const def = organizerPlanDefaults();
  ok("defaults: every organizer option is present, including the three monthly limits", "maxTournamentsPerMonth" in def && "maxLeaguesPerMonth" in def && "maxScrimsPerMonth" in def && "maxScrimSeries" in def);
  ok("complete: missing options are filled from the defaults", (() => { const r = completeOrganizerLimits({ maxScrimsPerMonth: 40 }); return r.ok && r.value.maxScrimsPerMonth === 40 && "maxGames" in r.value; })());
  ok("complete: nothing given -> all defaults", completeOrganizerLimits(undefined).ok);
  ok("complete: an unknown option is refused", !completeOrganizerLimits({ maxUnicorns: 3 }).ok);
  ok("complete: a negative or enormous number is refused", !completeOrganizerLimits({ maxGames: -1 }).ok && !completeOrganizerLimits({ maxGames: 5_000_000 }).ok);
  ok("complete: empty means unlimited and a true/false option must be true/false", (() => { const r = completeOrganizerLimits({ maxGames: null }); return r.ok && r.value.maxGames === null; })() && !completeOrganizerLimits({ advancedAnalytics: "yes" }).ok);
  const good = { contactName: "Ali Khan", contactEmail: " Ali@Example.COM ", contactPhone: "", limits: { maxScrimsPerMonth: 100 }, note: "Need lots of scrims" };
  ok("request: a good request passes and the email is cleaned", (() => { const r = validateCustomRequest(good); return r.ok && r.value.contactEmail === "ali@example.com" && r.value.limits.maxScrimsPerMonth === 100; })());
  ok("request: a phone number alone is enough", validateCustomRequest({ ...good, contactEmail: "", contactPhone: "+92 300 1234567" }).ok);
  ok("request: needs an email or a phone", !validateCustomRequest({ ...good, contactEmail: "", contactPhone: "" }).ok);
  ok("request: bad email, bad phone, short name, long note refused", !validateCustomRequest({ ...good, contactEmail: "nope" }).ok && !validateCustomRequest({ ...good, contactEmail: "", contactPhone: "abc" }).ok && !validateCustomRequest({ ...good, contactName: "A" }).ok && !validateCustomRequest({ ...good, note: "x".repeat(1001) }).ok);
  const lines = describeLimits("organizer", { ...def, maxTournamentsPerMonth: 5, maxLeaguesPerMonth: 1, maxScrimsPerMonth: null } as never).join(" | ");
  ok("copy: the plans page lists the three monthly limits separately", lines.includes("5 tournaments per month") && lines.includes("1 leagues per month") && /unlimited scrims per month/i.test(lines));
  ok("permission: staff with plans access can handle custom requests", hasAccess({ userId: "s", role: "manager" as const, grants: { plans: "edit" as const } }, "plans"));

  // ---- the database ----
  await prisma.user.createMany({ data: [
    { id: "adm", email: "adm@x.com", displayName: "Admin", isAdmin: true, kycStatus: "approved" as const },
    { id: "orgA", email: "a@x.com", displayName: "Org A", kycStatus: "approved" as const },
    { id: "orgB", email: "b@x.com", displayName: "Org B", kycStatus: "approved" as const },
    { id: "player", email: "p@x.com", displayName: "Player" },
  ] });
  const oA = await prisma.organizerProfile.create({ data: { userId: "orgA", orgName: "Alpha Esports", planCode: "organizer_pro" } });
  const oB = await prisma.organizerProfile.create({ data: { userId: "orgB", orgName: "Beta Esports", planCode: "organizer_pro" } });
  const game = await prisma.game.create({ data: { name: "Game A", isApproved: true } });

  // ---- separate monthly limits ----
  const pro = await prisma.plan.findUniqueOrThrow({ where: { code: "organizer_pro" } });
  ok("migration: the three monthly limits exist on the organizer plans", (await prisma.plan.findMany({ where: { audience: "organizer" } })).every((p) => "maxLeaguesPerMonth" in (p.limits as object) && "maxScrimsPerMonth" in (p.limits as object)));
  await prisma.plan.update({ where: { code: "organizer_pro" }, data: { limits: { ...(pro.limits as object), maxTournamentsPerMonth: 1, maxLeaguesPerMonth: 2, maxScrimsPerMonth: 0 } } });
  const mk = (type: "tournament" | "league" | "scrim", name: string, org = oA.id) => createTournament({ organizerId: org, gameId: game.id, name, type, mode: "solo", maxTeamSize: 1, maxTeams: 8, format: "points_table", entryType: "free" });
  const msg = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof PlanLimitError ? e.message : "other"; } };
  ok("monthly: the first tournament is allowed", (await msg(mk("tournament", "T1"))) === null);
  ok("monthly: the second tournament is refused, and the message says tournaments", ((await msg(mk("tournament", "T2"))) ?? "").includes("1 tournaments per month"));
  ok("monthly: leagues have their own limit (2 allowed)", (await msg(mk("league", "L1"))) === null && (await msg(mk("league", "L2"))) === null);
  ok("monthly: the third league is refused with a leagues message", ((await msg(mk("league", "L3"))) ?? "").includes("2 leagues per month"));
  ok("monthly: a limit of 0 means the plan doesn't include that kind", ((await msg(mk("scrim", "S1"))) ?? "").includes("doesn't include scrims"));
  ok("monthly: another organizer on the same plan has their own count", (await msg(mk("tournament", "TB", oB.id))) === null);
  await prisma.plan.update({ where: { code: "organizer_pro" }, data: { limits: { ...(pro.limits as object), maxTournamentsPerMonth: null, maxLeaguesPerMonth: null, maxScrimsPerMonth: 1 } } });
  ok("monthly: scrims allow exactly the number set, then stop", (await msg(mk("scrim", "S1"))) === null && ((await msg(mk("scrim", "S2"))) ?? "").includes("1 scrims per month"));
  ok("monthly: empty means unlimited for the other kinds", (await msg(mk("tournament", "T9"))) === null && (await msg(mk("league", "L9"))) === null);

  // ---- create a plan ----
  const made = await createPlan("adm", { audience: "organizer", name: "Studio Plan", priceAmount: 5000, priceCurrency: "PKR", durationDays: 30, limits: { maxScrimsPerMonth: 200 } });
  ok("createPlan: makes an active, paid, public plan with the usual options plus what was asked", !code(made) && (() => { const d = (made as { data: { code: string; isActive: boolean; isPaid: boolean; isPrivate: boolean; priceAmount: number; limits: Record<string, unknown> } }).data; return d.isActive && d.isPaid && !d.isPrivate && d.priceAmount === 5000 && d.limits.maxScrimsPerMonth === 200 && "maxGames" in d.limits; })());
  const dup = await createPlan("adm", { audience: "organizer", name: "Studio Plan", priceAmount: 6000, priceCurrency: "PKR" });
  ok("createPlan: the same name gets its own code", !code(dup) && (dup as { data: { code: string } }).data.code !== (made as { data: { code: string } }).data.code);
  const before = await prisma.plan.count();
  ok("createPlan: a bad price or unknown option makes nothing", code(await createPlan("adm", { audience: "organizer", name: "Bad", priceAmount: -5, priceCurrency: "PKR" })) === "validation_error" && code(await createPlan("adm", { audience: "organizer", name: "Bad2", priceAmount: 10, priceCurrency: "XXX" })) === "validation_error" && code(await createPlan("adm", { audience: "organizer", name: "Bad3", priceAmount: 10, priceCurrency: "PKR", limits: { maxUnicorns: 1 } })) === "validation_error" && (await prisma.plan.count()) === before);
  ok("createPlan: a short name or unknown audience is refused", code(await createPlan("adm", { audience: "organizer", name: "X", priceAmount: 10, priceCurrency: "PKR" })) === "validation_error" && code(await createPlan("adm", { audience: "alien", name: "Nice", priceAmount: 10, priceCurrency: "PKR" })) === "validation_error");
  ok("createPlan: public plans appear on the public list", (await listPlans({ audience: "organizer", activeOnly: true })).some((p) => p.name === "Studio Plan"));

  // ---- requests ----
  ok("request: a player with no organizer account can't ask", code(await submitCustomPlanRequest("player", { ...good })) === "not_organizer");
  ok("request: bad input saves nothing", code(await submitCustomPlanRequest("orgA", { ...good, contactName: "" })) === "validation_error" && (await prisma.customPlanRequest.count()) === 0);
  const r1 = await submitCustomPlanRequest("orgA", { contactName: "Ali Khan", contactEmail: "ali@example.com", contactPhone: "+92 300 1234567", limits: { maxScrimsPerMonth: 100, maxScrimSeries: 5, maxSeriesDays: null, prioritySupport: true }, note: "Big scrim league" });
  ok("request: a good request is saved as open", !code(r1) && (await countOpenCustomRequests()) === 1);
  for (let i = 1; i < MAX_OPEN_CUSTOM_REQUESTS; i++) await submitCustomPlanRequest("orgA", { ...good });
  ok("request: too many waiting requests are refused", code(await submitCustomPlanRequest("orgA", { ...good })) === "too_many");
  ok("request: my waiting requests are listed", (await getMyCustomRequests("orgA")).length === MAX_OPEN_CUSTOM_REQUESTS && (await getMyCustomRequests("orgB")).length === 0);
  const adminList = await listCustomRequestsForAdmin("open");
  const row = adminList.find((x) => x.id === (r1 as { data: { id: string } }).data.id)!;
  ok("admin list: shows who, their organization, current plan and what they asked for", row.orgName === "Alpha Esports" && row.contactPhone === "+92 300 1234567" && row.limits.maxScrimsPerMonth === 100 && row.limits.maxSeriesDays === null && row.currentPlan === "Organizer Pro");
  const reqId = row.id;

  // ---- quote ----
  ok("quote: needs a valid price, and a failed quote leaves the request open with no plan", code(await quoteCustomRequest("adm", reqId, { priceAmount: 0, priceCurrency: "PKR" })) === "validation_error" && (await prisma.plan.count({ where: { privateForUserId: { not: null } } })) === 0 && (await prisma.customPlanRequest.findUniqueOrThrow({ where: { id: reqId } })).status === "open");
  ok("quote: unknown request", code(await quoteCustomRequest("adm", "nope", { priceAmount: 100, priceCurrency: "PKR" })) === "not_found");
  const q = await quoteCustomRequest("adm", reqId, { priceAmount: 25000, priceCurrency: "PKR", durationDays: 90, adminNote: "Includes onboarding" });
  const planCode = (q as { data: { planCode: string } }).data?.planCode;
  const priv = await prisma.plan.findUniqueOrThrow({ where: { code: planCode } });
  ok("quote: makes a private, paid, active plan for that organizer with the asked-for options and the quoted price", !code(q) && priv.privateForUserId === "orgA" && priv.isPaid && priv.isActive && Number(priv.priceAmount?.toString()) === 25000 && priv.durationDays === 90 && (priv.limits as Record<string, unknown>).maxScrimsPerMonth === 100 && (priv.limits as Record<string, unknown>).maxSeriesDays === null && (priv.limits as Record<string, unknown>).prioritySupport === true);
  const after = await prisma.customPlanRequest.findUniqueOrThrow({ where: { id: reqId } });
  ok("quote: the request is marked quoted and linked to the plan", after.status === "quoted" && after.quotedPlanCode === planCode && after.handledById === "adm" && after.adminNote === "Includes onboarding");
  const note = await prisma.notification.findMany({ where: { userId: "orgA", type: "plan" } });
  ok("quote: the organizer is told the price and where to find it", note.length === 1 && note[0].body!.includes("90 days") && /25,?000/.test(note[0].body!) && note[0].href === "/plans");
  ok("quote: the plan is not on the public list or another organizer's list", !(await listPlans({ audience: "organizer", activeOnly: true })).some((p) => p.code === planCode) && !(await listPlans({ audience: "organizer", activeOnly: true, forUserId: "orgB" })).some((p) => p.code === planCode));
  ok("quote: it IS on the organizer's own list, marked private", (await listPlans({ audience: "organizer", activeOnly: true, forUserId: "orgA" })).some((p) => p.code === planCode && p.isPrivate));
  ok("quote: admin pickers and the editor can see it", (await listPlans({ audience: "organizer", activeOnly: true, includePrivate: true })).some((p) => p.code === planCode) && (await listPlans()).some((p) => p.code === planCode));
  ok("quote: another organizer can't switch to it", code(await previewPlanChange(oB.id, planCode)) === "invalid_target");
  const quotedAgain = await quoteCustomRequest("adm", reqId, { priceAmount: 20000, priceCurrency: "PKR", durationDays: 90 });
  ok("quote: quoting again updates the same plan instead of making another", !code(quotedAgain) && (quotedAgain as { data: { planCode: string } }).data.planCode === planCode && (await prisma.plan.count({ where: { privateForUserId: "orgA" } })) === 1 && Number((await prisma.plan.findUniqueOrThrow({ where: { code: planCode } })).priceAmount?.toString()) === 20000);
  ok("quote: it shows in the admin list with its price", (await listCustomRequestsForAdmin("quoted")).find((x) => x.id === reqId)?.quote?.price === 20000);

  // buying it: once granted, the organizer really gets the custom options
  await prisma.organizerProfile.update({ where: { id: oA.id }, data: { planCode, planExpiresAt: new Date(Date.now() + 30 * 86400000) } });
  const eff = await resolvePlan("organizer", await prisma.organizerProfile.findUniqueOrThrow({ where: { id: oA.id } }));
  ok("granted: the organizer's limits become the custom plan's", eff.code === planCode && eff.limits.maxScrimsPerMonth === 100 && eff.limits.maxScrimSeries === 5 && eff.limits.maxSeriesDays === null && eff.limits.prioritySupport === true);
  const view = await getPlanChangeView("orgA");
  ok("plan change view for another organizer never offers the private plan", !((await getPlanChangeView("orgB"))?.options ?? []).some((o) => o.targetCode === planCode) && view !== undefined);

  // ---- close ----
  const r2 = (await submitCustomPlanRequest("orgB", { ...good, contactName: "Beta Boss" })) as { data: { id: string } };
  const q2 = (await quoteCustomRequest("adm", r2.data.id, { priceAmount: 9000, priceCurrency: "PKR" })) as { data: { planCode: string } };
  ok("close: a quoted request that nobody bought withdraws its plan", !code(await closeCustomRequest("adm", r2.data.id, "Not needed")) && (await prisma.plan.findUniqueOrThrow({ where: { code: q2.data.planCode } })).isActive === false);
  ok("close: a plan the organizer already holds keeps working", !code(await closeCustomRequest("adm", reqId)) && (await prisma.plan.findUniqueOrThrow({ where: { code: planCode } })).isActive === true);
  ok("close: closed requests can't be quoted or closed again", code(await quoteCustomRequest("adm", reqId, { priceAmount: 1, priceCurrency: "PKR" })) === "invalid_status" && code(await closeCustomRequest("adm", reqId)) === "invalid_status" && code(await closeCustomRequest("adm", "nope")) === "not_found");
  ok("close: closed requests no longer count as waiting", (await getMyCustomRequests("orgB")).length === 0);

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
