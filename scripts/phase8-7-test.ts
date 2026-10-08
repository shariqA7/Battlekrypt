// Per-institute entry quotas, single-institute teams, and the "can't change
// institute while you have a live entry" lock. Needs a Postgres with all
// migrations applied. See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { registerForTournament, manualAddRegistration, rejectRegistration } from "../lib/services/tournaments";
import {
  createInstitution, setInstitutionVerified, setPlayerInstitution, addTournamentInstitution,
  setInstitutionEntryLimit, getInstitutionUsage, countActiveEntries, checkTeamRosterInstitution,
} from "../lib/services/institutions";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const names = ["adm", "fast", "comsats", "f1", "f2", "f3", "f4", "c1", "c2"];
  await prisma.user.createMany({ data: names.map((u) => ({ id: u, email: `${u}@x.com`, displayName: u, isAdmin: u === "adm" })) });
  const org = { fast: await prisma.organizerProfile.create({ data: { userId: "fast", orgName: "FAST" } }), comsats: await prisma.organizerProfile.create({ data: { userId: "comsats", orgName: "COMSATS" } }) };
  const inst: Record<string, string> = {};
  for (const k of ["fast", "comsats"] as const) {
    const r = await createInstitution(org[k].id, `${k} university`);
    if (!("data" in r)) throw new Error("institute");
    inst[k] = r.data.id;
    await setInstitutionVerified(r.data.id, "adm", true);
  }
  const prof: Record<string, string> = {};
  for (const [u, i] of [["f1", "fast"], ["f2", "fast"], ["f3", "fast"], ["f4", "fast"], ["c1", "comsats"], ["c2", "comsats"]] as const) {
    prof[u] = (await prisma.playerProfile.create({ data: { userId: u, firstName: u, lastName: "x" } })).id;
    await setPlayerInstitution(u, { institutionId: inst[i], studentId: null, acknowledged: false }, new Date(Date.now() - 30 * DAY));
  }
  const game = await prisma.game.create({ data: { name: "G" } });
  const base = { organizerId: org.fast.id, gameId: game.id, type: "tournament", maxTeams: 50, format: "single_elimination", status: "registration_open", audienceScope: "institution", entryType: "free" } as const;
  const solo = await prisma.tournament.create({ data: { ...base, slug: "solo", name: "Solo Cup", mode: "solo" } });
  const squad = await prisma.tournament.create({ data: { ...base, slug: "squad", name: "Squad Cup", mode: "squad" } });
  await addTournamentInstitution(solo.id, org.fast.id, inst.comsats, "guest");
  await addTournamentInstitution(squad.id, org.fast.id, inst.comsats, "guest");

  // ---------- quotas
  ok("only the host can set limits", err(await setInstitutionEntryLimit(solo.id, org.comsats.id, null, 2)) === "forbidden");
  ok("limit must be a positive whole number", err(await setInstitutionEntryLimit(solo.id, org.fast.id, null, 0)) === "invalid_limit" && err(await setInstitutionEntryLimit(solo.id, org.fast.id, null, 1.5)) === "invalid_limit");
  ok("can't set an override for an institute that isn't part of the tournament", err(await setInstitutionEntryLimit(solo.id, org.fast.id, "nope", 1)) === "not_found");
  ok("set default limit of 2", "data" in await setInstitutionEntryLimit(solo.id, org.fast.id, null, 2));

  const a = await registerForTournament({ tournamentId: solo.id, playerId: prof.f1 });
  const b = await registerForTournament({ tournamentId: solo.id, playerId: prof.f2 });
  ok("two entries fit", !err(a) && !err(b));
  ok("the entry stores which institute it plays for", "data" in a && a.data?.institutionId === inst.fast);
  const third = await registerForTournament({ tournamentId: solo.id, playerId: prof.f3 });
  ok("a third entry from the same institute is refused", err(third) === "institution_quota_full");
  ok("organizer manual-add can't bypass the quota either", err(await manualAddRegistration(solo.id, org.fast.id, "f4@x.com")) === "institution_quota_full");
  ok("another institute has its own allowance", !err(await registerForTournament({ tournamentId: solo.id, playerId: prof.c1 })));
  const usage = await getInstitutionUsage(solo.id);
  ok("usage numbers", usage[inst.fast] === 2 && usage[inst.comsats] === 1);

  if ("data" in a && a.data) await rejectRegistration(a.data.id, org.fast.id);
  ok("rejecting an entry frees its slot", !err(await registerForTournament({ tournamentId: solo.id, playerId: prof.f3 })));

  ok("per-institute override replaces the default", "data" in await setInstitutionEntryLimit(solo.id, org.fast.id, inst.comsats, 1));
  ok("override applies (COMSATS capped at 1, already used)", err(await registerForTournament({ tournamentId: solo.id, playerId: prof.c2 })) === "institution_quota_full");
  ok("raising the override lets them in", "data" in await setInstitutionEntryLimit(solo.id, org.fast.id, inst.comsats, 3) && !err(await registerForTournament({ tournamentId: solo.id, playerId: prof.c2 })));
  ok("clearing the default removes the cap for others", "data" in await setInstitutionEntryLimit(solo.id, org.fast.id, null, null) && !err(await registerForTournament({ tournamentId: solo.id, playerId: prof.f4 })));

  // a team is ONE entry, however many players it has
  await setInstitutionEntryLimit(squad.id, org.fast.id, null, 1);
  const team = await registerForTournament({ tournamentId: squad.id, playerId: prof.f1, teamMemberPlayerIds: [prof.f2], teamName: "FastA" });
  ok("a two-player team uses ONE entry", !err(team) && (await getInstitutionUsage(squad.id))[inst.fast] === 1);
  ok("a second team from that institute is refused", err(await registerForTournament({ tournamentId: squad.id, playerId: prof.f3, teamMemberPlayerIds: [prof.f4], teamName: "FastB" })) === "institution_quota_full");
  ok("mixed teams are refused", err(await registerForTournament({ tournamentId: squad.id, playerId: prof.c1, teamMemberPlayerIds: [prof.f3], teamName: "Mixed" })) === "institution_mixed_team");

  // roster edits after registering must stay on the team's institute
  ok("roster edit: same institute ok", "ok" in await checkTeamRosterInstitution(squad.id, [prof.f1, prof.f3], inst.fast));
  ok("roster edit: adding another institute's player refused", err(await checkTeamRosterInstitution(squad.id, [prof.f1, prof.c1], inst.fast)) === "institution_mixed_team");
  ok("roster edit: a player with no institute refused", err(await checkTeamRosterInstitution(squad.id, [prof.f1, "does-not-exist"], inst.fast)) === "institution_mixed_team");
  ok("roster edit: open tournaments aren't restricted", "ok" in await checkTeamRosterInstitution((await prisma.tournament.create({ data: { ...base, slug: "open", name: "Open", audienceScope: "open", mode: "squad" } })).id, [prof.f1, prof.c1], null));

  // ---------- institute change lock (30 days ago => the 7-day wait is over for everyone)
  const change = (u: string, to: string) => setPlayerInstitution(u, { institutionId: to, studentId: null, acknowledged: true });
  // f1/f2 are on a live team + f1 also a solo entry (rejected above) ; f3 has a live solo entry
  ok("registered in a live tournament -> can't change institute", err(await change("f3", inst.comsats)) === "has_active_entries");
  ok("team member (not the registrant) is locked too", err(await change("f2", inst.comsats)) === "has_active_entries");
  ok("counts tournaments", (await countActiveEntries(prof.f3, "f3")).tournaments === 1);

  // a player who only had a rejected entry is free to change
  await prisma.registration.updateMany({ where: { playerId: prof.f4 }, data: { status: "rejected" } });
  ok("a rejected entry doesn't hold anyone", err(await change("f4", inst.comsats)) === null);

  // finishing the tournament releases everyone in it
  await prisma.tournament.update({ where: { id: solo.id }, data: { status: "completed" } });
  ok("completed tournament releases the player", err(await change("f3", inst.comsats)) === null);
  await prisma.tournament.update({ where: { id: squad.id }, data: { status: "cancelled" } });
  ok("cancelled tournament releases the team", err(await change("f2", inst.comsats)) === null);

  // challenges count too
  const ch = await prisma.challenge.create({ data: {
    posterUserId: "fast", posterType: "organizer", posterName: "FAST", title: "T", description: "D", gameId: game.id,
    slots: 1, maxApplicants: 5, applicationsCloseAt: new Date(Date.now() + 5 * DAY), completeWithinDays: 3,
    prizeType: "reward", prizeDescription: "x", payoutMethod: "none", status: "open",
  } });
  await prisma.challengeApplication.create({ data: { challengeId: ch.id, applicantUserId: "c1", kind: "player", entrantName: "c1", rating: 1000, status: "applied" } });
  ok("a live challenge application locks the institute", err(await change("c1", inst.fast)) === "has_active_entries" && (await countActiveEntries(prof.c1, "c1")).challenges === 1);
  await prisma.challengeApplication.updateMany({ where: { applicantUserId: "c1" }, data: { status: "withdrawn" } });
  ok("withdrawing releases it", err(await change("c1", inst.fast)) === null);
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
