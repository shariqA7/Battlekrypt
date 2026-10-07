// Needs a Postgres with all migrations applied. See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { registerForTournament, manualAddRegistration, updateTournament, listTournaments } from "../lib/services/tournaments";
import { submitInstitution, reviewInstitution, getInstitutionForUser, isOwnProofPath } from "../lib/services/institutions";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);

async function verify(userId: string, playerId: string) {
  await submitInstitution(userId, { institutionName: "LUMS", studentId: null, idImagePath: `${userId}/id.jpg` });
  const row = await getInstitutionForUser(userId);
  await reviewInstitution(row!.id, "adm", "approve");
  return playerId;
}

async function main() {
  await prisma.user.createMany({ data: [
    { id: "adm", email: "adm@x.com", displayName: "Admin", isAdmin: true },
    { id: "org", email: "org@x.com", displayName: "Org" },
    { id: "s1", email: "s1@x.com", displayName: "Student" },
    { id: "s2", email: "s2@x.com", displayName: "Student2" },
    { id: "n1", email: "n1@x.com", displayName: "NotStudent" },
  ]});
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "OrgCo" } });
  const mk = (u: string) => prisma.playerProfile.create({ data: { userId: u, firstName: u, lastName: "x" } });
  const [s1, s2, n1] = [await mk("s1"), await mk("s2"), await mk("n1")];
  const game = await prisma.game.create({ data: { name: "TestGame" } });
  const base = { organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 50, format: "single_elimination", entryType: "free", status: "published" } as const;
  const open = await prisma.tournament.create({ data: { ...base, slug: "open-t", name: "Open" } });
  const inst = await prisma.tournament.create({ data: { ...base, slug: "inst-t", name: "Inst", audienceScope: "institution" } });
  const fresh = await prisma.tournament.create({ data: { ...base, slug: "fresh-t", name: "Fresh", audienceScope: "institution", requireFreshInstitutionProof: true } });
  const squad = await prisma.tournament.create({ data: { ...base, slug: "squad-t", name: "Squad", mode: "squad", audienceScope: "institution" } });

  // open tournaments are unaffected
  ok("open: unverified player can join", !err(await registerForTournament({ tournamentId: open.id, playerId: n1.id })));

  // institution-only
  ok("inst: unverified blocked", err(await registerForTournament({ tournamentId: inst.id, playerId: n1.id })) === "institution_required");
  await submitInstitution("s1", { institutionName: "LUMS", studentId: null, idImagePath: "s1/id.jpg" });
  ok("inst: PENDING verification still blocked", err(await registerForTournament({ tournamentId: inst.id, playerId: s1.id })) === "institution_required");
  await verify("s1", s1.id);
  ok("inst: verified player can join", !err(await registerForTournament({ tournamentId: inst.id, playerId: s1.id })));

  // fresh proof
  ok("fresh: verified but no proof blocked", err(await registerForTournament({ tournamentId: fresh.id, playerId: s1.id })) === "institution_proof_required");
  const withProof = await registerForTournament({ tournamentId: fresh.id, playerId: s1.id, institutionProofPath: "s1/proof.jpg" });
  ok("fresh: with proof ok and path stored", !err(withProof) && "data" in withProof && withProof.data?.institutionProofPath === "s1/proof.jpg");
  ok("fresh: skipping proof does NOT skip verification", err(await registerForTournament({ tournamentId: fresh.id, playerId: n1.id, skipInstitutionProof: true })) === "institution_required");

  // squad: every member must be verified
  ok("squad: unverified teammate blocks", err(await registerForTournament({ tournamentId: squad.id, playerId: s1.id, teamMemberPlayerIds: [n1.id], teamName: "T" })) === "institution_required");
  await verify("s2", s2.id);
  ok("squad: all verified ok", !err(await registerForTournament({ tournamentId: squad.id, playerId: s1.id, teamMemberPlayerIds: [s2.id], teamName: "T" })));

  // manual add
  ok("manual-add: unverified blocked", err(await manualAddRegistration(inst.id, org.id, "n1@x.com")) === "institution_required");
  ok("manual-add: verified ok, no proof needed even on fresh tournament", !err(await manualAddRegistration(fresh.id, org.id, "s2@x.com")));

  // locking
  ok("audience change blocked once registrations exist", err(await updateTournament(inst.id, org.id, { audienceScope: "open" })) === "audience_locked");
  ok("resending same value is allowed", !err(await updateTournament(inst.id, org.id, { audienceScope: "institution", name: "Inst2" })));
  const empty = await prisma.tournament.create({ data: { ...base, slug: "empty-t", name: "Empty" } });
  ok("no registrations: can switch to institution", !err(await updateTournament(empty.id, org.id, { audienceScope: "institution", requireFreshInstitutionProof: true })));
  const e2 = await prisma.tournament.findUnique({ where: { id: empty.id } });
  ok("fresh flag saved", e2?.audienceScope === "institution" && e2.requireFreshInstitutionProof === true);
  await updateTournament(empty.id, org.id, { audienceScope: "open" });
  const e3 = await prisma.tournament.findUnique({ where: { id: empty.id } });
  ok("switching to open clears the fresh flag", e3?.requireFreshInstitutionProof === false);
  await updateTournament(empty.id, org.id, { name: "Renamed" });
  await updateTournament(fresh.id, org.id, { name: "Fresh2" });
  const f2 = await prisma.tournament.findUnique({ where: { id: fresh.id } });
  ok("editing other fields keeps the fresh flag", f2?.requireFreshInstitutionProof === true);

  // browse filter
  const only = await listTournaments({ audienceScope: "institution" });
  ok("filter returns only institution tournaments", only.total === 3 && only.data.every((t) => t.audienceScope === "institution"));
  ok("no filter returns all published", (await listTournaments({})).total === 5);

  // proof path safety
  ok("proof path must be in own folder", isOwnProofPath("s1/a.jpg", "s1") && !isOwnProofPath("s2/a.jpg", "s1") && !isOwnProofPath("s1/../s2/a.jpg", "s1") && !isOwnProofPath(undefined, "s1"));
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
