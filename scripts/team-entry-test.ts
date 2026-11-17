// Team games need a club: the rule, which button each person should see, and the club-entry
// error map. Needs a Postgres with all migrations applied (see phase8-1-test.ts).
import { prisma } from "../lib/prisma";
import { requiresClubTeam, teamEntryState } from "../lib/team-entry";
import { getTeamEntryStatus } from "../lib/services/team-entry";
import { CLUB_ENTRY_ERRORS } from "../lib/services/club-entries";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const none = { ownsClub: false, ownedClubApproved: false, hasEligibleTeam: false, onTeamForGame: false, onClubRoster: false };

async function main() {
  // ---- the rule (no database) ----
  ok("rule: duo and squad need a club team", requiresClubTeam("duo") && requiresClubTeam("squad"));
  ok("rule: solo does not", !requiresClubTeam("solo") && !requiresClubTeam(null) && !requiresClubTeam(undefined));
  ok("state: nothing -> create a club", teamEntryState(none) === "no_club");
  ok("state: owner of an approved club with a team for the game -> ready", teamEntryState({ ...none, ownsClub: true, ownedClubApproved: true, hasEligibleTeam: true, onClubRoster: true }) === "ready");
  ok("state: captain -> ready", teamEntryState({ ...none, hasEligibleTeam: true, onTeamForGame: true, onClubRoster: true }) === "ready");
  ok("state: plain team member -> ask the captain", teamEntryState({ ...none, onTeamForGame: true, onClubRoster: true }) === "not_captain");
  ok("state: owner with no team for this game", teamEntryState({ ...none, ownsClub: true, ownedClubApproved: true, onClubRoster: false }) === "no_team_for_game");
  ok("state: owner of a club still awaiting approval", teamEntryState({ ...none, ownsClub: true, ownedClubApproved: false }) === "club_pending");
  ok("state: member of a club that has no team for this game", teamEntryState({ ...none, onClubRoster: true }) === "no_team_for_game");

  // ---- the club-entry error map: every code registerForTournament can return needs an entry ----
  for (const code of ["conditions_not_met", "organizer_paused", "payment_proof_required", "payment_reference_required", "already_registered", "registration_closed"]) {
    ok(`error map: has ${code}`, code in CLUB_ENTRY_ERRORS);
  }

  // ---- the facts, from the database ----
  const names = ["owner", "cap", "mate", "member", "newbie", "pend", "soloowner"];
  await prisma.user.createMany({ data: names.map((u) => ({ id: u, email: `${u}@x.com`, displayName: u })) });
  const mk = (u: string) => prisma.playerProfile.create({ data: { birthDate: new Date("2000-01-01"), userId: u, firstName: u, lastName: "x", planCode: "player_basic" } });
  const [pOwner, pCap, pMate, pMember] = await Promise.all(["owner", "cap", "mate", "member"].map(mk));
  const org = await prisma.organizerProfile.create({ data: { userId: "soloowner", orgName: "Org", planCode: "organizer_pro" } });
  const gA = await prisma.game.create({ data: { name: "Game A", isApproved: true } });
  const gB = await prisma.game.create({ data: { name: "Game B", isApproved: true } });
  const club = await prisma.clubProfile.create({ data: { userId: "owner", clubName: "Alpha Club", subscriptionPlanCode: "club_pro" } });
  const teamA = await prisma.clubTeam.create({ data: { clubId: club.id, gameId: gA.id, name: "A Team" } });
  await prisma.clubRoster.create({ data: { clubId: club.id, playerId: pCap.id, gameId: gA.id, teamId: teamA.id, isCaptain: true } });
  await prisma.clubRoster.create({ data: { clubId: club.id, playerId: pMate.id, gameId: gA.id, teamId: teamA.id } });
  await prisma.clubRoster.create({ data: { clubId: club.id, playerId: pMember.id, gameId: gB.id, teamId: null } }); // on the roster, solo-style, no team
  void pOwner;
  await prisma.clubProfile.create({ data: { userId: "pend", clubName: "Pending Club", status: "pending" } });

  const base = { organizerId: org.id, type: "scrim", entryType: "free" as const, maxTeams: 20, format: "points_table", status: "registration_open" as const };
  const squadA = await prisma.tournament.create({ data: { ...base, gameId: gA.id, slug: "squad-a", name: "Squad A", mode: "squad", maxTeamSize: 4 } });
  const squadB = await prisma.tournament.create({ data: { ...base, gameId: gB.id, slug: "squad-b", name: "Squad B", mode: "squad", maxTeamSize: 4 } });
  const duoA = await prisma.tournament.create({ data: { ...base, gameId: gA.id, slug: "duo-a", name: "Duo A", mode: "duo", maxTeamSize: 2 } });
  const soloA = await prisma.tournament.create({ data: { ...base, gameId: gA.id, slug: "solo-a", name: "Solo A", mode: "solo", maxTeamSize: 1 } });

  const st = (u: string, t: string) => getTeamEntryStatus(u, t);
  ok("status: unknown tournament -> null", (await st("owner", "nope")) === null);
  ok("status: solo game has no club requirement", (await st("newbie", soloA.id))?.required === false);
  const s1 = await st("newbie", squadA.id);
  ok("status: a person with no club is told to create one", s1?.required === true && s1.state === "no_club" && s1.gameName === "Game A");
  ok("status: duo games follow the same rule", (await st("newbie", duoA.id)) && (await st("newbie", duoA.id) as { state?: string }).state === "no_club");
  const s2 = await st("owner", squadA.id);
  ok("status: club owner with a team for the game is ready", s2?.required === true && s2.state === "ready" && s2.clubName === "Alpha Club" && s2.ownsClub);
  const s3 = await st("cap", squadA.id);
  ok("status: the team captain is ready", s3?.required === true && s3.state === "ready");
  const s4 = await st("mate", squadA.id);
  ok("status: an ordinary team member is told to ask the captain", s4?.required === true && s4.state === "not_captain");
  const s5 = await st("owner", squadB.id);
  ok("status: owner whose club has no team for this game is told to add one", s5?.required === true && s5.state === "no_team_for_game" && s5.gameName === "Game B");
  const s6 = await st("member", squadA.id);
  ok("status: a roster member of a club with no team on this game can't enter", s6?.required === true && s6.state === "no_team_for_game" && !s6.ownsClub);
  const s7 = await st("pend", squadA.id);
  ok("status: a club awaiting approval is not ready", s7?.required === true && s7.state === "club_pending");
  const s8 = await st("cap", squadB.id);
  ok("status: being captain for game A does not help on game B", s8?.required === true && s8.state !== "ready");

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
