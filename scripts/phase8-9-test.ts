// Institute notifications: who is told what — and who is NOT. Needs a Postgres with
// all migrations applied. See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { registerForTournament, approveRegistration, rejectRegistration } from "../lib/services/tournaments";
import { createChallenge } from "../lib/services/challenges";
import { applyToChallenge } from "../lib/services/challenge-applications";
import {
  createInstitution, setInstitutionVerified, setPlayerInstitution, addTournamentInstitution, respondToCoHostInvite,
} from "../lib/services/institutions";
import {
  addChallengeInstitution, respondToChallengeInvite, reviewChallengeApplication,
} from "../lib/services/challenge-institutions";
import { notifyNewQueueItem } from "../lib/services/institution-notifications";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const DAY = 24 * 60 * 60 * 1000;
const types = async (userId: string) => (await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }));
const has = async (u: string, type: string) => (await types(u)).some((n) => n.type === type);
const count = async (u: string, type?: string) => (await types(u)).filter((n) => !type || n.type === type).length;

async function main() {
  const users = ["adm", "fast", "comsats", "lums", "other", "f1", "c1", "c2", "l1"];
  await prisma.user.createMany({ data: users.map((u) => ({ id: u, email: `${u}@x.com`, displayName: u, isAdmin: u === "adm" })) });
  const org: Record<string, { id: string }> = {};
  for (const u of ["fast", "comsats", "lums", "other"]) org[u] = await prisma.organizerProfile.create({ data: { userId: u, orgName: `${u} esports`, planCode: "organizer_pro" } });
  const inst: Record<string, string> = {};
  for (const u of ["fast", "comsats", "lums"]) {
    const r = await createInstitution(org[u].id, `${u} university`);
    if (!("data" in r)) throw new Error("institute");
    inst[u] = r.data.id;
    await setInstitutionVerified(r.data.id, "adm", true);
  }
  const prof: Record<string, string> = {};
  for (const [u, i] of [["f1", "fast"], ["c1", "comsats"], ["c2", "comsats"], ["l1", "lums"]] as const) {
    prof[u] = (await prisma.playerProfile.create({ data: { userId: u, firstName: u, lastName: "x", planCode: "player_basic" } })).id;
    await setPlayerInstitution(u, { institutionId: inst[i], studentId: null, acknowledged: false }, new Date(Date.now() - 30 * DAY));
  }
  const game = await prisma.game.create({ data: { name: "G", isApproved: true } });
  const base = { organizerId: org.fast.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 50, format: "single_elimination", status: "registration_open", audienceScope: "institution" } as const;
  const free = await prisma.tournament.create({ data: { ...base, slug: "free", name: "Free Cup", entryType: "free" } });
  const paid = await prisma.tournament.create({ data: { ...base, slug: "paid", name: "Paid Cup", entryType: "paid" } });

  // ---------- tournament invites
  const inv = await addTournamentInstitution(free.id, org.fast.id, inst.comsats, "cohost");
  await addTournamentInstitution(free.id, org.fast.id, inst.lums, "guest");
  const cInv = (await types("comsats")).find((n) => n.type === "institute_invite");
  ok("co-host invite notifies the invited organization", !!cInv && cInv.title.includes("co-host") && cInv.title.includes("Free Cup") && cInv.href === "/organizer/dashboard/institute");
  const gInv = (await types("lums")).find((n) => n.type === "institute_invite");
  ok("guest addition notifies that organization, wording says guest", !!gInv && gInv.title.includes("guest"));
  ok("the host and unrelated organizations are not notified of invites", (await count("fast")) === 0 && (await count("other")) === 0);

  if ("data" in inv) await respondToCoHostInvite(inv.data.id, org.comsats.id, true);
  const resp = (await types("fast")).find((n) => n.type === "institute_invite_response");
  ok("the host is told when the co-host accepts", !!resp && resp.title.includes("accepted") && resp.href === `/organizer/dashboard/tournaments/${free.id}`);

  // ---------- queue + decisions
  const before = { fast: await count("fast"), comsats: await count("comsats"), lums: await count("lums") };
  const rC = await registerForTournament({ tournamentId: free.id, playerId: prof.c1 });
  const rF = await registerForTournament({ tournamentId: free.id, playerId: prof.f1 });
  const rL = await registerForTournament({ tournamentId: free.id, playerId: prof.l1 });
  ok("a player entering the co-host's queue notifies the co-host", (await count("comsats", "institute_queue")) === 1 && (await types("comsats")).find((n) => n.type === "institute_queue")?.href === `/organizer/dashboard/institute/tournaments/${free.id}`);
  ok("the host's own player and a guest's player notify no co-host", (await count("comsats")) === before.comsats + 1 && (await count("lums")) === before.lums);
  ok("self-registrations don't spam the host", (await count("fast")) === before.fast);
  if (!("data" in rC && rC.data && "data" in rF && rF.data && "data" in rL && rL.data)) { console.log("setup failed"); fails++; return; }

  await approveRegistration(rC.data.id, org.comsats.id);
  const a = (await types("c1")).find((n) => n.type === "entry_approved");
  ok("co-host approval tells the player", !!a && a.title.includes("approved") && a.href === `/tournaments/${free.id}`);
  await rejectRegistration(rL.data.id, org.fast.id);
  const rj = (await types("l1")).find((n) => n.type === "entry_rejected");
  ok("a rejection tells the player who reviewed it", !!rj && (rj.body ?? "").includes("organizer"));
  await approveRegistration(rF.data.id, org.fast.id);
  ok("host approval tells the player", await has("f1", "entry_approved"));
  ok("nobody else heard about those decisions", (await count("c2")) === 0 && (await count("other")) === 0);

  // ---------- paid: co-host confirms eligibility, host still owes the payment check
  const pi = await addTournamentInstitution(paid.id, org.fast.id, inst.comsats, "cohost");
  if ("data" in pi) await respondToCoHostInvite(pi.data.id, org.comsats.id, true);
  const rp = await registerForTournament({ tournamentId: paid.id, playerId: prof.c2, paymentProofUrl: "https://x/r.png" });
  const fastBefore = await count("fast", "institute_awaiting_payment");
  if ("data" in rp && rp.data) await approveRegistration(rp.data.id, org.comsats.id);
  const wait = (await types("fast")).find((n) => n.type === "institute_awaiting_payment");
  ok("a co-host approving a PAID entry tells the host to check the payment", fastBefore === 0 && !!wait && wait.title.includes("comsats university"));
  const c2a = (await types("c2")).find((n) => n.type === "entry_approved");
  ok("...and tells the player the organizer still has to confirm payment", !!c2a && (c2a.body ?? "").includes("payment"));

  // ---------- challenges
  const input = { postAs: "organizer", title: "FAST Challenge", description: "Beat the host in a 1v1 and send a screenshot.", gameId: game.id, entrantType: "either", minRating: null, slots: 1, maxApplicants: 20, openDays: 7, completeWithinDays: 3, prizeType: "reward", prizeDescription: "Free scrim", cashAmount: null, cashCurrency: null, prizeEstimatedUsd: null, payoutMethod: "In person", acceptTerms: true, audienceScope: "institution", maxApplicationsPerInstitute: null } as const;
  const ch = await createChallenge("fast", { ...input } as never);
  if (!("data" in ch)) { console.log(JSON.stringify(ch)); fails++; return; }
  const cid = ch.data.id;
  const ci = await addChallengeInstitution(cid, org.fast.id, inst.comsats, "cohost");
  ok("challenge co-host invite notifies the invited organization", (await types("comsats")).some((n) => n.type === "institute_invite" && n.title.includes("FAST Challenge")));
  if ("data" in ci) await respondToChallengeInvite(ci.data.id, org.comsats.id, false);
  ok("the poster is told the co-host declined", (await types("fast")).some((n) => n.type === "institute_invite_response" && n.title.includes("declined") && n.href === `/challenges/${cid}`));
  const ci2 = await prisma.challengeInstitution.update({ where: { challengeId_institutionId: { challengeId: cid, institutionId: inst.comsats } }, data: { status: "accepted" } });
  void ci2;

  const q0 = await count("comsats", "institute_queue");
  const ap = await applyToChallenge("c1", cid, { kind: "player" });
  ok("an applicant in the co-host's queue notifies the co-host", (await count("comsats", "institute_queue")) === q0 + 1 && (await types("comsats")).filter((n) => n.type === "institute_queue").pop()?.href === `/organizer/dashboard/institute/challenges/${cid}`);
  ok("the poster still gets the normal new-applicant notice", (await types("fast")).some((n) => n.type === "challenge_application"));
  const apF = await applyToChallenge("f1", cid, { kind: "player" });
  ok("the poster's own institute's applicant doesn't notify the co-host", (await count("comsats", "institute_queue")) === q0 + 1);

  if ("data" in ap) await reviewChallengeApplication(ap.data.id, org.comsats.id, true);
  ok("approving an applicant tells them", (await types("c1")).some((n) => n.type === "challenge_institute_approved" && n.href === `/challenges/${cid}`));
  if ("data" in apF) await reviewChallengeApplication(apF.data.id, org.fast.id, false);
  ok("rejecting an applicant tells them", (await types("f1")).some((n) => n.type === "challenge_not_selected"));
  ok("an unrelated organization heard nothing", (await count("other")) === 0);

  // ---------- notifications can never break the action
  let threw = false;
  try { await notifyNewQueueItem("tournament", "no-such-id", "no-such-institute"); } catch { threw = true; }
  ok("a notification about something that doesn't exist fails quietly", !threw);
  const r2 = await rejectRegistration(rp && "data" in rp && rp.data ? rp.data.id : "x", org.fast.id);
  ok("decisions still succeed (notification is best-effort)", "data" in r2);
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
