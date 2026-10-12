// Institution-only CHALLENGES: audience, co-hosts, single-institute teams, per-institute
// application limits, and the institute review the poster's pick depends on.
// Needs a Postgres with all migrations applied. See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { validateChallenge } from "../lib/validation/challenge";
import { createChallenge } from "../lib/services/challenges";
import { applyToChallenge, selectApplicants } from "../lib/services/challenge-applications";
import {
  addChallengeInstitution, removeChallengeInstitution, respondToChallengeInvite, setChallengeInstitutionLimit,
  getChallengeInstitutionUsage, listApplicationsForInstitute, reviewChallengeApplication, listChallengeCoHostInvitations,
} from "../lib/services/challenge-institutions";
import { createInstitution, setInstitutionVerified, setPlayerInstitution, countActiveEntries } from "../lib/services/institutions";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const DAY = 24 * 60 * 60 * 1000;
const ids = (r: { data?: { id: string }[] } | { error: string }) => ("data" in r && r.data ? r.data.map((x) => x.id).sort() : []);

async function main() {
  // Paid plans are seeded by the migrations: organizer_pro, club_pro, player_basic.
  const users = ["adm", "fast", "comsats", "lums", "other", "f1", "f2", "c1", "c2", "c3", "l1", "n1", "clubowner"];
  await prisma.user.createMany({ data: users.map((u) => ({ id: u, email: `${u}@x.com`, displayName: u, isAdmin: u === "adm" })) });
  const org: Record<string, { id: string; userId: string }> = {};
  for (const u of ["fast", "comsats", "lums", "other"]) {
    org[u] = await prisma.organizerProfile.create({ data: { userId: u, orgName: `${u} esports`, planCode: "organizer_pro" } });
  }
  const inst: Record<string, string> = {};
  for (const u of ["fast", "comsats", "lums"]) {
    const r = await createInstitution(org[u].id, `${u} university`);
    if (!("data" in r)) throw new Error("institute");
    inst[u] = r.data.id;
  }
  const prof: Record<string, string> = {};
  const memberOf: [string, string | null][] = [["f1", "fast"], ["f2", "fast"], ["c1", "comsats"], ["c2", "comsats"], ["c3", "comsats"], ["l1", "lums"], ["n1", null]];
  for (const [u, i] of memberOf) {
    prof[u] = (await prisma.playerProfile.create({ data: { userId: u, firstName: u, lastName: "x", planCode: "player_basic" } })).id;
    if (i) {
      await setInstitutionVerified(inst[i], "adm", true).catch(() => null);
    }
  }
  for (const [u, i] of memberOf) if (i) await setPlayerInstitution(u, { institutionId: inst[i], studentId: null, acknowledged: false }, new Date(Date.now() - 30 * DAY));
  const game = await prisma.game.create({ data: { name: "G", isApproved: true } });

  // ---------- posting
  const input = {
    postAs: "organizer", title: "FAST Challenge", description: "Beat the host in a 1v1 match, send a screenshot.", gameId: game.id,
    entrantType: "either", minRating: null, slots: 1, maxApplicants: 20, openDays: 7, completeWithinDays: 3, prizeType: "reward",
    prizeDescription: "Free scrim entry", cashAmount: null, cashCurrency: null, prizeEstimatedUsd: null, payoutMethod: "In person", acceptTerms: true,
    audienceScope: "institution", maxApplicationsPerInstitute: null,
  } as const;
  ok("validation: institution-only needs an organization poster", "errors" in validateChallenge({ ...input, postAs: "player" }) && (validateChallenge({ ...input, postAs: "player" }) as { errors: Record<string, string> }).errors.audienceScope !== undefined);
  ok("validation: per-institute limit 1..50", "errors" in validateChallenge({ ...input, maxApplicationsPerInstitute: 0 }) && "data" in validateChallenge({ ...input, maxApplicationsPerInstitute: 3 }));
  ok("validation: defaults to open", (validateChallenge({ ...input, audienceScope: undefined }) as { data: { audienceScope: string } }).data.audienceScope === "open");

  await prisma.institution.update({ where: { id: inst.fast }, data: { verified: false, verifiedAt: null } });
  const blocked = await createChallenge("fast", { ...input } as never);
  ok("host institute not verified -> can't post institution-only", err(blocked) === "institution_host_required");
  await setInstitutionVerified(inst.fast, "adm", true);
  const created = await createChallenge("fast", { ...input } as never);
  ok("verified host can post institution-only", "data" in created);
  if (!("data" in created)) { console.log(JSON.stringify(created)); return; }
  const cid = created.data.id;
  ok("saved as institution-only", (await prisma.challenge.findUnique({ where: { id: cid } }))?.audienceScope === "institution");
  const open = await createChallenge("fast", { ...input, audienceScope: "open" } as never);
  ok("open challenges still work, anyone can apply", "data" in open && !err(await applyToChallenge("n1", open.data.id, { kind: "player" })));

  // ---------- who may apply
  ok("no institute -> blocked", err(await applyToChallenge("n1", cid, { kind: "player" })) === "institution_required");
  ok("other institute (not added) -> blocked", err(await applyToChallenge("c1", cid, { kind: "player" })) === "institution_required");
  const f1 = await applyToChallenge("f1", cid, { kind: "player" });
  ok("host institute member can apply", "data" in f1);
  const f1row = "data" in f1 ? await prisma.challengeApplication.findUnique({ where: { id: f1.data.id } }) : null;
  ok("application is pending institute review, routed to the host", f1row?.institutionReview === "pending" && f1row.institutionId === inst.fast && f1row.routedInstitutionId === null);

  // ---------- co-hosts / guests
  ok("only the host can add institutes", err(await addChallengeInstitution(cid, org.comsats.id, inst.lums, "guest")) === "forbidden");
  ok("not on an open challenge", err(await addChallengeInstitution((open as { data: { id: string } }).data.id, org.fast.id, inst.comsats, "cohost")) === "not_institution_challenge");
  ok("can't add the host itself", err(await addChallengeInstitution(cid, org.fast.id, inst.fast, "cohost")) === "is_host");
  const inv = await addChallengeInstitution(cid, org.fast.id, inst.comsats, "cohost");
  ok("co-host invited", "data" in inv);
  ok("guest added", "data" in await addChallengeInstitution(cid, org.fast.id, inst.lums, "guest"));
  if (!("data" in inv)) return;
  ok("pending co-host's players still blocked", err(await applyToChallenge("c1", cid, { kind: "player" })) === "institution_required");
  ok("invited org sees the invite", (await listChallengeCoHostInvitations(org.comsats.id)).length === 1);
  ok("someone else can't answer it", err(await respondToChallengeInvite(inv.data.id, org.lums.id, true)) === "forbidden");
  ok("accept", "data" in await respondToChallengeInvite(inv.data.id, org.comsats.id, true));

  const c1 = await applyToChallenge("c1", cid, { kind: "player" });
  const l1 = await applyToChallenge("l1", cid, { kind: "player" });
  ok("co-host's player applies", "data" in c1);
  const c1row = "data" in c1 ? await prisma.challengeApplication.findUnique({ where: { id: c1.data.id } }) : null;
  ok("...routed to the co-host's queue", c1row?.routedInstitutionId === inst.comsats && c1row.institutionId === inst.comsats);
  const l1row = "data" in l1 ? await prisma.challengeApplication.findUnique({ where: { id: l1.data.id } }) : null;
  ok("guest institute's player applies, host handles them", "data" in l1 && l1row?.routedInstitutionId === null);

  // ---------- teams: ONE institute
  await prisma.user.update({ where: { id: "clubowner" }, data: {} });
  await prisma.playerProfile.create({ data: { userId: "clubowner", firstName: "o", lastName: "o" } }).catch(() => null);
  const club = await prisma.clubProfile.create({ data: { userId: "clubowner", clubName: "Club", subscriptionPlanCode: "club_pro" } });
  const mixedTeam = await prisma.clubTeam.create({ data: { clubId: club.id, gameId: game.id, name: "Mixed" } });
  const comsatsTeam = await prisma.clubTeam.create({ data: { clubId: club.id, gameId: game.id, name: "ComsatsOnly" } });
  const emptyTeam = await prisma.clubTeam.create({ data: { clubId: club.id, gameId: game.id, name: "Empty" } });
  const roster = (p: string, t: string) => prisma.clubRoster.create({ data: { clubId: club.id, playerId: prof[p], gameId: game.id, teamId: t } });
  await roster("f2", mixedTeam.id); await roster("c3", mixedTeam.id);
  await roster("c2", comsatsTeam.id);
  ok("a mixed-institute team is refused", err(await applyToChallenge("clubowner", cid, { kind: "team", clubTeamId: mixedTeam.id })) === "institution_mixed_team");
  ok("a team with no players is refused", err(await applyToChallenge("clubowner", cid, { kind: "team", clubTeamId: emptyTeam.id })) === "institution_required");
  const team = await applyToChallenge("clubowner", cid, { kind: "team", clubTeamId: comsatsTeam.id });
  ok("a single-institute team applies", "data" in team);
  const teamRow = "data" in team ? await prisma.challengeApplication.findUnique({ where: { id: team.data.id } }) : null;
  ok("...and goes to its institute's queue", teamRow?.institutionId === inst.comsats && teamRow.routedInstitutionId === inst.comsats);
  ok("a team application locks every roster player's institute", (await countActiveEntries(prof.c2, "c2")).challenges === 1);

  // ---------- queues + review
  const all = await listApplicationsForInstitute(cid, org.fast.id);
  const mineQ = await listApplicationsForInstitute(cid, org.fast.id, "mine");
  const theirs = await listApplicationsForInstitute(cid, org.comsats.id);
  const f1id = f1row!.id, c1id = c1row!.id, l1id = l1row!.id, tid = teamRow!.id;
  ok("host sees every application", JSON.stringify(ids(all)) === JSON.stringify([f1id, c1id, l1id, tid].sort()));
  ok("host 'my requests' excludes the co-host's", JSON.stringify(ids(mineQ)) === JSON.stringify([f1id, l1id].sort()));
  ok("co-host sees only its own institute's applicants", JSON.stringify(ids(theirs)) === JSON.stringify([c1id, tid].sort()) && "role" in theirs && theirs.role === "cohost");
  ok("guest institute / outsiders see nothing", err(await listApplicationsForInstitute(cid, org.lums.id)) === "forbidden" && err(await listApplicationsForInstitute(cid, org.other.id)) === "forbidden");

  ok("co-host can NOT review the host's applicant", err(await reviewChallengeApplication(f1id, org.comsats.id, true)) === "forbidden");
  ok("co-host can NOT review a guest's applicant", err(await reviewChallengeApplication(l1id, org.comsats.id, true)) === "forbidden");
  ok("guest institute can NOT review anyone", err(await reviewChallengeApplication(l1id, org.lums.id, true)) === "forbidden");
  ok("unrelated organization can NOT review", err(await reviewChallengeApplication(f1id, org.other.id, true)) === "forbidden");
  ok("co-host approves its own applicant", "data" in await reviewChallengeApplication(c1id, org.comsats.id, true));
  ok("co-host rejects its own team", "data" in await reviewChallengeApplication(tid, org.comsats.id, false));
  const rej = await prisma.challengeApplication.findUnique({ where: { id: tid } });
  ok("rejected application is out", rej?.institutionReview === "rejected" && rej.status === "not_selected");
  ok("a rejected entrant can't re-apply to the same queue", err(await applyToChallenge("clubowner", cid, { kind: "team", clubTeamId: comsatsTeam.id })) === "institute_rejected");
  ok("host approves its own", "data" in await reviewChallengeApplication(f1id, org.fast.id, true));
  const cAppr = await prisma.challengeApplication.findUnique({ where: { id: c1id } });
  ok("approval records which institute vouched", cAppr?.institutionReview === "approved" && cAppr.approvedByInstitutionId === inst.comsats);

  // ---------- the poster can only pick approved applicants
  ok("poster can't pick someone their institute hasn't approved", err(await selectApplicants("fast", cid, [l1id], true)) === "invalid_selection");
  ok("host can approve a guest institute's applicant", "data" in await reviewChallengeApplication(l1id, org.fast.id, true));

  // ---------- limits (on a second challenge)
  const second = await createChallenge("fast", { ...input, title: "Second Challenge", maxApplicationsPerInstitute: 1 } as never);
  if (!("data" in second)) { console.log(JSON.stringify(second)); fails++; return; }
  const sid = second.data.id;
  const sc = await addChallengeInstitution(sid, org.fast.id, inst.comsats, "cohost");
  if ("data" in sc) await respondToChallengeInstitutionAccept(sc.data.id);
  async function respondToChallengeInstitutionAccept(id: string) { await respondToChallengeInvite(id, org.comsats.id, true); }
  ok("only the host sets limits", err(await setChallengeInstitutionLimit(sid, org.comsats.id, null, 2)) === "forbidden");
  ok("invalid limit refused", err(await setChallengeInstitutionLimit(sid, org.fast.id, null, 0)) === "invalid_limit");
  ok("first application from an institute fits (default limit 1)", !err(await applyToChallenge("f1", sid, { kind: "player" })));
  ok("second one from the same institute is refused", err(await applyToChallenge("f2", sid, { kind: "player" })) === "institution_quota_full");
  const u = await getChallengeInstitutionUsage(sid);
  ok("usage per institute", u[inst.fast] === 1);
  const f1s = await prisma.challengeApplication.findFirstOrThrow({ where: { challengeId: sid, applicantUserId: "f1" } });
  await reviewChallengeApplication(f1s.id, org.fast.id, false);
  ok("rejecting frees the slot", !err(await applyToChallenge("f2", sid, { kind: "player" })));
  ok("override lets one institute send more", "data" in await setChallengeInstitutionLimit(sid, org.fast.id, inst.comsats, 2) && !err(await applyToChallenge("c1", sid, { kind: "player" })) && !err(await applyToChallenge("c2", sid, { kind: "player" })));
  ok("...but not past the override", err(await applyToChallenge("c3", sid, { kind: "player" })) === "institution_quota_full");
  ok("can't remove an institute that has applicants", err(await removeChallengeInstitution(sid, org.fast.id, inst.comsats)) === "has_registrations");

  // ---------- two co-hosts must not be able to act on each other's applicants
  const third = await createChallenge("fast", { ...input, title: "Third Challenge" } as never);
  if (!("data" in third)) { console.log(JSON.stringify(third)); fails++; return; }
  const tid3 = third.data.id;
  for (const k of ["comsats", "lums"]) {
    const l = await addChallengeInstitution(tid3, org.fast.id, inst[k], "cohost");
    if ("data" in l) await respondToChallengeInvite(l.data.id, org[k].id, true);
  }
  await applyToChallenge("c3", tid3, { kind: "player" });
  await applyToChallenge("l1", tid3, { kind: "player" });
  const appC = await prisma.challengeApplication.findFirstOrThrow({ where: { challengeId: tid3, applicantUserId: "c3" } });
  const appL = await prisma.challengeApplication.findFirstOrThrow({ where: { challengeId: tid3, applicantUserId: "l1" } });
  ok("co-host A can NOT review co-host B's applicant", err(await reviewChallengeApplication(appC.id, org.lums.id, true)) === "forbidden" && err(await reviewChallengeApplication(appL.id, org.comsats.id, true)) === "forbidden");
  ok("each co-host sees only its own applicants", JSON.stringify(ids(await listApplicationsForInstitute(tid3, org.comsats.id))) === JSON.stringify([appC.id]) && JSON.stringify(ids(await listApplicationsForInstitute(tid3, org.lums.id))) === JSON.stringify([appL.id]));
  ok("each co-host CAN review its own", "data" in await reviewChallengeApplication(appC.id, org.comsats.id, true) && "data" in await reviewChallengeApplication(appL.id, org.lums.id, true));

  // ---------- the pick itself (first challenge): approved applicants only
  ok("poster picks an approved applicant", "data" in await selectApplicants("fast", cid, [c1id], true));
  const after = await prisma.challengeApplication.findMany({ where: { challengeId: cid } });
  ok("picked one is selected, the rest turned down", after.find((a) => a.id === c1id)?.status === "selected" && after.filter((a) => a.status === "selected").length === 1);
  ok("can't review once the pick is made", err(await reviewChallengeApplication(f1id, org.fast.id, false)) === "not_reviewable");
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
