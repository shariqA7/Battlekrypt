// Admin ID-photo view: listing, search, paging, and the audit trail. Needs a
// Postgres with all migrations applied. See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { listInstitutionProofs, requestProofView, PROOFS_PAGE_SIZE } from "../lib/services/institution-proofs";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };

async function main() {
  await prisma.user.createMany({ data: [
    { id: "adm", email: "adm@x.com", displayName: "Admin", isAdmin: true },
    { id: "adm2", email: "adm2@x.com", displayName: "Admin Two", isAdmin: true },
    { id: "org", email: "org@x.com", displayName: "Org" },
  ]});
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "FAST Esports", planCode: "organizer_pro" } });
  const fast = await prisma.institution.create({ data: { name: "FAST University", organizerId: org.id, verified: true } });
  const game = await prisma.game.create({ data: { name: "G", isApproved: true } });
  const base = { organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 500, format: "single_elimination", status: "registration_open", audienceScope: "institution", entryType: "free" } as const;
  const cup = await prisma.tournament.create({ data: { ...base, slug: "spring", name: "Spring Cup" } });
  const lan = await prisma.tournament.create({ data: { ...base, slug: "lan", name: "Winter LAN" } });

  const mkPlayer = async (id: string, name: string, email: string) => {
    await prisma.user.create({ data: { id, email, displayName: name } });
    return prisma.playerProfile.create({ data: { birthDate: new Date("2000-01-01"), userId: id, firstName: name, lastName: "x" } });
  };
  const alice = await mkPlayer("alice", "Alice Khan", "alice@students.edu");
  const bob = await mkPlayer("bob", "Bob Ali", "bob@students.edu");
  const cara = await mkPlayer("cara", "Cara Noor", "cara@students.edu");

  const rA = await prisma.registration.create({ data: { tournamentId: cup.id, playerId: alice.id, institutionId: fast.id, institutionProofPath: "alice/a.jpg", status: "pending" } });
  const rB = await prisma.registration.create({ data: { tournamentId: cup.id, playerId: bob.id, institutionId: fast.id, institutionProofPath: "bob/b.jpg", status: "approved" } });
  await prisma.registration.create({ data: { tournamentId: lan.id, playerId: cara.id, institutionId: fast.id, institutionProofPath: "cara/c.jpg", status: "rejected" } });
  const noProof = await prisma.registration.create({ data: { tournamentId: lan.id, playerId: alice.id, institutionId: fast.id, status: "approved" } });

  // ---- listing
  const all = await listInstitutionProofs({});
  ok("lists only entries that carry an ID photo", all.total === 3 && all.rows.length === 3 && !all.rows.some((r) => r.id === noProof.id));
  ok("the list never exposes the storage path", all.rows.every((r) => !("institutionProofPath" in r) && !JSON.stringify(r).includes("alice/a.jpg")));
  ok("rows carry what a dispute needs", all.rows.some((r) => r.entrant === "Alice Khan" && r.tournament.name === "Spring Cup" && r.institute === "FAST University" && r.email === "alice@students.edu"));
  ok("newest entry first", all.rows[0].registeredAt >= all.rows[all.rows.length - 1].registeredAt);

  // ---- search + filter
  const byTournament = await listInstitutionProofs({ q: "winter" });
  ok("search by tournament name (case-insensitive)", byTournament.total === 1 && byTournament.rows[0].entrant === "Cara Noor");
  ok("search by player name", (await listInstitutionProofs({ q: "bob" })).total === 1);
  ok("search by e-mail", (await listInstitutionProofs({ q: "alice@students" })).total === 1);
  ok("search by institute name", (await listInstitutionProofs({ q: "fast univ" })).total === 3);
  ok("search with no match", (await listInstitutionProofs({ q: "nobody" })).total === 0);
  ok("search treats % and quotes as plain text", (await listInstitutionProofs({ q: "%" })).total === 0 && (await listInstitutionProofs({ q: "'; drop table \"Registration\"; --" })).total === 0);
  // a name that really contains the wildcard characters is found by typing them
  const odd = await mkPlayer("odd", "Odd_100%", "odd@students.edu");
  await prisma.registration.create({ data: { tournamentId: lan.id, playerId: odd.id, institutionId: fast.id, institutionProofPath: "odd/o.jpg" } });
  ok("a literal % or _ in the search finds exactly that name", (await listInstitutionProofs({ q: "100%" })).total === 1 && (await listInstitutionProofs({ q: "Odd_" })).total === 1 && (await listInstitutionProofs({ q: "d_1" })).total === 1);
  ok("...and still doesn't act as a wildcard", (await listInstitutionProofs({ q: "O_d" })).total === 0 && (await listInstitutionProofs({ q: "1%0" })).total === 0);
  ok("a blank search means everything", (await listInstitutionProofs({ q: "   " })).total === 4);
  ok("status filter", (await listInstitutionProofs({ status: "approved" })).total === 1 && (await listInstitutionProofs({ status: "rejected" })).total === 1);
  ok("search and status combine", (await listInstitutionProofs({ q: "spring", status: "pending" })).total === 1 && (await listInstitutionProofs({ q: "spring", status: "rejected" })).total === 0);

  // ---- team entries search by team name
  const team = await prisma.teamEntry.create({ data: { tournamentId: cup.id, name: "Night Owls" } });
  await prisma.registration.create({ data: { tournamentId: cup.id, teamEntryId: team.id, institutionId: fast.id, institutionProofPath: "team/t.jpg" } });
  const t = await listInstitutionProofs({ q: "night owls" });
  ok("a team entry is found by team name and shown as the entrant", t.total === 1 && t.rows[0].entrant === "Night Owls");

  // ---- paging
  for (let i = 0; i < 30; i++) {
    const p = await mkPlayer(`bulk${i}`, `Bulk ${i}`, `bulk${i}@students.edu`);
    await prisma.registration.create({ data: { tournamentId: lan.id, playerId: p.id, institutionId: fast.id, institutionProofPath: `bulk${i}/p.jpg` } });
  }
  const total = 5 + 30;
  const p1 = await listInstitutionProofs({ page: 1 }), p2 = await listInstitutionProofs({ page: 2 });
  ok(`pages of ${PROOFS_PAGE_SIZE}`, p1.total === total && p1.pages === Math.ceil(total / PROOFS_PAGE_SIZE) && p1.rows.length === PROOFS_PAGE_SIZE && p2.rows.length === total - PROOFS_PAGE_SIZE);
  ok("pages don't overlap", p1.rows.every((r) => !p2.rows.some((x) => x.id === r.id)));
  ok("nonsense page numbers are safe", (await listInstitutionProofs({ page: 0 })).page === 1 && (await listInstitutionProofs({ page: -4 })).page === 1 && (await listInstitutionProofs({ page: 9999 })).rows.length === 0);

  // ---- opening a photo is audited
  const logs = () => prisma.adminActionLog.findMany({ where: { action: "institution_proof_viewed" }, orderBy: { createdAt: "asc" } });
  ok("no log rows before anyone looks", (await logs()).length === 0);
  const v = await requestProofView(rA.id, "adm");
  ok("the admin gets the storage path", "data" in v && v.data.path === "alice/a.jpg");
  const l1 = await logs();
  ok("...and exactly one audit row names the admin and the entry", l1.length === 1 && l1[0].adminId === "adm" && l1[0].targetType === "Registration" && l1[0].targetId === rA.id);
  await requestProofView(rB.id, "adm2");
  await requestProofView(rA.id, "adm");
  const l3 = await logs();
  ok("every view is its own row, with the right admin each time", l3.length === 3 && l3[1].adminId === "adm2" && l3[1].targetId === rB.id && l3[2].targetId === rA.id);
  const before = (await logs()).length;
  const none = await requestProofView(noProof.id, "adm");
  const gone = await requestProofView("does-not-exist", "adm");
  ok("an entry without a photo, or one that doesn't exist, gives an error", "error" in none && none.error === "no_proof" && "error" in gone && gone.error === "not_found");
  ok("...and writes no audit row (nothing was shown)", (await logs()).length === before);
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
