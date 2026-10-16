// Needs a Postgres with all migrations applied (incl. 20261015000000_age_gate).
// See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { updateTournament } from "../lib/services/tournaments";
import { registerForTournament, manualAddRegistration, updatePlayerProfile } from "../lib/services/tournaments";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const yearsAgo = (y: number, extraDays = 0) => {
  const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - y); d.setUTCDate(d.getUTCDate() + extraDays);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  await prisma.user.createMany({ data: [
    { id: "org", email: "org@x.com", displayName: "Org", kycStatus: "approved" },
    { id: "adult", email: "adult@x.com", displayName: "Adult" },
    { id: "teen", email: "teen@x.com", displayName: "Teen" },
    { id: "nodob", email: "nodob@x.com", displayName: "NoDob" },
    { id: "new1", email: "new1@x.com", displayName: "New1" },
    { id: "almost", email: "almost@x.com", displayName: "Almost" },
  ]});
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "OrgCo" } });
  const adult = await prisma.playerProfile.create({ data: { userId: "adult", firstName: "A", lastName: "dult", birthDate: yearsAgo(25) } });
  const teen = await prisma.playerProfile.create({ data: { userId: "teen", firstName: "T", lastName: "een", birthDate: yearsAgo(15) } });
  const nodob = await prisma.playerProfile.create({ data: { userId: "nodob", firstName: "N", lastName: "odob" } });
  await prisma.playerProfile.create({ data: { userId: "new1" } });
  const game = await prisma.game.create({ data: { name: "G" } });
  const base = { organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 50, format: "single_elimination", entryType: "free", status: "published" } as const;
  const t13 = await prisma.tournament.create({ data: { ...base, slug: "t13", name: "T13" } });
  const t18 = await prisma.tournament.create({ data: { ...base, slug: "t18", name: "T18", minAge: 18 } });
  const t16 = await prisma.tournament.create({ data: { ...base, slug: "t16", name: "T16", minAge: 16 } });

  // self-registration
  ok("default is 13+ and a 15-year-old can join", !err(await registerForTournament({ tournamentId: t13.id, playerId: teen.id })));
  ok("a 15-year-old is blocked from 16+", err(await registerForTournament({ tournamentId: t16.id, playerId: teen.id })) === "age_restricted");
  ok("a 15-year-old is blocked from 18+", err(await registerForTournament({ tournamentId: t18.id, playerId: teen.id })) === "age_restricted");
  ok("an adult can join 18+", !err(await registerForTournament({ tournamentId: t18.id, playerId: adult.id })));
  ok("no date of birth -> blocked even from 13+", err(await registerForTournament({ tournamentId: t13.id, playerId: nodob.id })) === "birth_date_required");

  // a player who turns 16 tomorrow is still 15 today; one who turned 16 yesterday is in
  const almostP = await prisma.playerProfile.create({ data: { userId: "almost", firstName: "Al", lastName: "most", birthDate: yearsAgo(16, 1) } });
  ok("turns 16 tomorrow -> still blocked from 16+", err(await registerForTournament({ tournamentId: t16.id, playerId: almostP.id })) === "age_restricted");
  await prisma.playerProfile.update({ where: { id: almostP.id }, data: { birthDate: yearsAgo(16, -1) } });
  ok("turned 16 yesterday -> allowed", !err(await registerForTournament({ tournamentId: t16.id, playerId: almostP.id })));

  // organizer manual add can't bypass the age limit
  ok("manual add: a 15-year-old is refused for 18+", err(await manualAddRegistration(t18.id, org.id, "teen@x.com")) === "age_restricted");
  ok("manual add: no date of birth is refused", err(await manualAddRegistration(t18.id, org.id, "nodob@x.com")) === "birth_date_required");

  // team entry: one under-age member blocks the whole entry, without naming them
  const squad = await prisma.tournament.create({ data: { ...base, slug: "sq18", name: "Squad18", mode: "squad", minAge: 18 } });
  const r = await registerForTournament({ tournamentId: squad.id, playerId: adult.id, teamMemberPlayerIds: [teen.id], teamName: "Mixed" });
  ok("squad with an under-age member is refused", err(r) === "age_restricted");
  ok("the message doesn't name the player", !!r && "message" in r && !String(r.message).includes("T"));

  // profile: date of birth required once, 13+ floor, then locked
  const noDob = await updatePlayerProfile("new1", { firstName: "N", lastName: "One" });
  ok("profile save without a date of birth is refused", err(noDob) === "birth_date_required");
  const young = await updatePlayerProfile("new1", { firstName: "N", lastName: "One", birthDate: iso(yearsAgo(12)) });
  ok("under 13 is refused", err(young) === "under_age");
  ok("...and nothing was stored", (await prisma.playerProfile.findUnique({ where: { userId: "new1" } }))?.birthDate === null);
  const bad = await updatePlayerProfile("new1", { firstName: "N", lastName: "One", birthDate: "2010-02-31" });
  ok("an impossible date is refused", err(bad) === "validation_error");
  const good = await updatePlayerProfile("new1", { firstName: "N", lastName: "One", birthDate: iso(yearsAgo(14)) });
  ok("a valid 14-year-old date is saved, with age kept in step", !err(good) && (await prisma.playerProfile.findUnique({ where: { userId: "new1" } }))?.age === 14);
  await updatePlayerProfile("new1", { firstName: "N", lastName: "One", birthDate: iso(yearsAgo(30)) });
  ok("the date of birth is locked once saved", iso((await prisma.playerProfile.findUnique({ where: { userId: "new1" } }))!.birthDate!) === iso(yearsAgo(14)));

  // tournament: the age requirement locks once anyone has registered
  ok("minAge can change while nobody has registered", !err(await updateTournament(squad.id, org.id, { minAge: 16 })));
  ok("minAge can't change after players registered", err(await updateTournament(t13.id, org.id, { minAge: 18 })) === "age_locked");
  ok("resending the same value is fine", !err(await updateTournament(t13.id, org.id, { minAge: 13 })));

}
main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
