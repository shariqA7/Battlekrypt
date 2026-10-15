// Entry limits under CONCURRENCY: when several players from one institute enter at
// the same instant, the limit must hold. Needs a Postgres with all migrations applied.
// See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { registerForTournament, manualAddRegistration } from "../lib/services/tournaments";
import { manualAddClubSoloEntry, manualAddClubTeamEntry } from "../lib/services/club-entries";
import { createChallenge } from "../lib/services/challenges";
import { applyToChallenge } from "../lib/services/challenge-applications";
import { createInstitution, setInstitutionVerified, setPlayerInstitution } from "../lib/services/institutions";

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`); if (!cond) fails++; };
const DAY = 24 * 60 * 60 * 1000;
const succeeded = (r: unknown) => !(r && typeof r === "object" && "error" in r);

const PLAYERS = 8;
const ROUNDS = 25;

async function main() {
  const names = ["adm", "fast", ...Array.from({ length: PLAYERS }, (_, i) => `p${i}`)];
  await prisma.user.createMany({ data: names.map((u) => ({ id: u, email: `${u}@x.com`, displayName: u, isAdmin: u === "adm" })) });
  const org = await prisma.organizerProfile.create({ data: { userId: "fast", orgName: "FAST", planCode: "organizer_pro" } });
  const inst = await createInstitution(org.id, "FAST University");
  if (!("data" in inst)) throw new Error("institute");
  await setInstitutionVerified(inst.data.id, "adm", true);
  const prof: string[] = [];
  for (let i = 0; i < PLAYERS; i++) {
    const p = await prisma.playerProfile.create({ data: { userId: `p${i}`, firstName: `p${i}`, lastName: "x", planCode: "player_basic" } });
    prof.push(p.id);
    await setPlayerInstitution(`p${i}`, { institutionId: inst.data.id, studentId: null, acknowledged: false }, new Date(Date.now() - 30 * DAY));
  }
  const game = await prisma.game.create({ data: { name: "G", isApproved: true } });
  const base = { organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 50, format: "single_elimination", status: "registration_open", audienceScope: "institution", entryType: "free" } as const;
  const live = (tournamentId: string) => prisma.registration.count({ where: { tournamentId, institutionId: inst.data.id, status: { in: ["pending", "approved"] } } });

  // ---- self-registration: limit 1, everyone races
  let worst = 0, roundsOver = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const t = await prisma.tournament.create({ data: { ...base, slug: `self-${r}`, name: `Self ${r}`, maxEntriesPerInstitute: 1 } });
    const results = await Promise.all(prof.map((playerId) => registerForTournament({ tournamentId: t.id, playerId })));
    const wins = results.filter(succeeded).length;
    const inDb = await live(t.id);
    worst = Math.max(worst, wins, inDb);
    if (wins !== 1 || inDb !== 1) roundsOver++;
  }
  ok(`self-registration: limit 1 holds in all ${ROUNDS} rounds of ${PLAYERS} simultaneous players`, roundsOver === 0, `(rounds that broke the limit: ${roundsOver}, worst entries seen: ${worst})`);

  // ---- self-registration with a larger limit: exactly 3 of 8
  let badMid = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const t = await prisma.tournament.create({ data: { ...base, slug: `mid-${r}`, name: `Mid ${r}`, maxEntriesPerInstitute: 3 } });
    const results = await Promise.all(prof.map((playerId) => registerForTournament({ tournamentId: t.id, playerId })));
    if (results.filter(succeeded).length !== 3 || (await live(t.id)) !== 3) badMid++;
  }
  ok(`self-registration: limit 3 gives exactly 3 entries in all ${ROUNDS} rounds`, badMid === 0, `(bad rounds: ${badMid})`);

  // ---- organizer manual-add races too
  let badManual = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const t = await prisma.tournament.create({ data: { ...base, slug: `man-${r}`, name: `Manual ${r}`, maxEntriesPerInstitute: 1 } });
    const results = await Promise.all(prof.map((_, i) => manualAddRegistration(t.id, org.id, `p${i}@x.com`)));
    if (results.filter(succeeded).length !== 1 || (await live(t.id)) !== 1) badManual++;
  }
  ok(`organizer manual-add: limit 1 holds in all ${ROUNDS} rounds`, badManual === 0, `(bad rounds: ${badManual})`);

  // ---- self-registration and manual-add racing each other
  let badMixed = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const t = await prisma.tournament.create({ data: { ...base, slug: `mix-${r}`, name: `Mixed ${r}`, maxEntriesPerInstitute: 2 } });
    const calls = prof.map((playerId, i) => (i % 2 === 0 ? registerForTournament({ tournamentId: t.id, playerId }) : manualAddRegistration(t.id, org.id, `p${i}@x.com`)));
    const results = await Promise.all(calls);
    if (results.filter(succeeded).length !== 2 || (await live(t.id)) !== 2) badMixed++;
  }
  ok(`self-registration + manual-add racing: limit 2 holds in all ${ROUNDS} rounds`, badMixed === 0, `(bad rounds: ${badMixed})`);

  // ---- organizer-added CLUB entries race too (solo roster players, and whole teams)
  await prisma.user.create({ data: { id: "clubowner", email: "clubowner@x.com", displayName: "clubowner" } });
  const club = await prisma.clubProfile.create({ data: { userId: "clubowner", clubName: "Race Club", subscriptionPlanCode: "club_pro" } });
  const soloPlayers: string[] = [];
  for (let i = 0; i < PLAYERS; i++) {
    await prisma.user.create({ data: { id: `s${i}`, email: `s${i}@x.com`, displayName: `s${i}` } });
    const p = await prisma.playerProfile.create({ data: { userId: `s${i}`, firstName: `s${i}`, lastName: "x", planCode: "player_basic" } });
    await setPlayerInstitution(`s${i}`, { institutionId: inst.data.id, studentId: null, acknowledged: false }, new Date(Date.now() - 30 * DAY));
    await prisma.clubRoster.create({ data: { clubId: club.id, playerId: p.id, gameId: game.id, teamId: null } });
    soloPlayers.push(p.id);
  }
  let badClubSolo = 0;
  for (let r = 0; r < 15; r++) {
    const t = await prisma.tournament.create({ data: { ...base, slug: `club-solo-${r}`, name: `Club solo ${r}`, maxEntriesPerInstitute: 1 } });
    const results = await Promise.all(soloPlayers.map((playerId) => manualAddClubSoloEntry(t.id, org.id, playerId)));
    if (results.filter(succeeded).length !== 1 || (await live(t.id)) !== 1) badClubSolo++;
  }
  ok("club solo manual-add: limit 1 holds in all 15 rounds", badClubSolo === 0, `(bad rounds: ${badClubSolo})`);

  const teams: { id: string; members: string[] }[] = [];
  for (let k = 0; k < 4; k++) {
    const team = await prisma.clubTeam.create({ data: { clubId: club.id, gameId: game.id, name: `Team ${k}` } });
    const members: string[] = [];
    for (let m = 0; m < 2; m++) {
      const u = `t${k}${m}`;
      await prisma.user.create({ data: { id: u, email: `${u}@x.com`, displayName: u } });
      const p = await prisma.playerProfile.create({ data: { userId: u, firstName: u, lastName: "x", planCode: "player_basic" } });
      await setPlayerInstitution(u, { institutionId: inst.data.id, studentId: null, acknowledged: false }, new Date(Date.now() - 30 * DAY));
      await prisma.clubRoster.create({ data: { clubId: club.id, playerId: p.id, gameId: game.id, teamId: team.id } });
      members.push(p.id);
    }
    teams.push({ id: team.id, members });
  }
  let badClubTeam = 0;
  for (let r = 0; r < 15; r++) {
    const t = await prisma.tournament.create({ data: { ...base, slug: `club-team-${r}`, name: `Club team ${r}`, mode: "squad", maxTeamSize: 2, maxEntriesPerInstitute: 1 } });
    const results = await Promise.all(teams.map((tm) => manualAddClubTeamEntry(t.id, org.id, tm.id, tm.members)));
    if (results.filter(succeeded).length !== 1 || (await live(t.id)) !== 1) badClubTeam++;
  }
  ok("club team manual-add: limit 1 holds in all 15 rounds with 4 teams entering at once", badClubTeam === 0, `(bad rounds: ${badClubTeam})`);

  // ---- a different institute is not blocked by someone else's full quota
  const inst2 = await createInstitution((await prisma.organizerProfile.create({ data: { userId: "adm", orgName: "Other", planCode: "organizer_pro" } })).id, "Other University");
  if ("data" in inst2) {
    await setInstitutionVerified(inst2.data.id, "adm", true);
    await prisma.user.create({ data: { id: "q1", email: "q1@x.com", displayName: "q1" } });
    const q = await prisma.playerProfile.create({ data: { userId: "q1", firstName: "q", lastName: "q", planCode: "player_basic" } });
    await setPlayerInstitution("q1", { institutionId: inst2.data.id, studentId: null, acknowledged: false }, new Date(Date.now() - 30 * DAY));
    const t = await prisma.tournament.create({ data: { ...base, slug: "two-inst", name: "Two", maxEntriesPerInstitute: 1 } });
    await prisma.tournamentInstitution.create({ data: { tournamentId: t.id, institutionId: inst2.data.id, role: "guest", status: "accepted" } });
    const results = await Promise.all([...prof.slice(0, 4).map((playerId) => registerForTournament({ tournamentId: t.id, playerId })), registerForTournament({ tournamentId: t.id, playerId: q.id })]);
    const guestOk = succeeded(results[4]);
    ok("a full institute doesn't block another institute entering at the same moment", guestOk && results.slice(0, 4).filter(succeeded).length === 1);
  }

  // ---- challenges (already serialised by a row lock): same guarantee
  const input = { postAs: "organizer", title: "Race Challenge", description: "Beat the host in a 1v1 and send a screenshot.", gameId: game.id, entrantType: "either", minRating: null, slots: 1, maxApplicants: 50, openDays: 7, completeWithinDays: 3, prizeType: "reward", prizeDescription: "x", cashAmount: null, cashCurrency: null, prizeEstimatedUsd: null, payoutMethod: "In person", acceptTerms: true, audienceScope: "institution", maxApplicationsPerInstitute: 2 } as const;
  let badChal = 0;
  for (let r = 0; r < 8; r++) {
    const ch = await createChallenge("fast", { ...input, title: `Race Challenge ${r}` } as never);
    if (!("data" in ch)) { console.log(JSON.stringify(ch)); fails++; break; }
    const results = await Promise.all(prof.map((_, i) => applyToChallenge(`p${i}`, ch.data.id, { kind: "player" })));
    const n = await prisma.challengeApplication.count({ where: { challengeId: ch.data.id, institutionId: inst.data.id, status: "applied" } });
    if (results.filter(succeeded).length !== 2 || n !== 2) badChal++;
  }
  ok("challenge applications: limit 2 holds in all 8 rounds of simultaneous applicants", badChal === 0, `(bad rounds: ${badChal})`);
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
