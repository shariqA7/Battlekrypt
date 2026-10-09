// Institution-only tournaments: who may enter. Needs a Postgres with all migrations applied.
// See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { registerForTournament, manualAddRegistration, updateTournament, listTournaments, publishTournament } from "../lib/services/tournaments";
import { createInstitution, setInstitutionVerified, setPlayerInstitution, addTournamentInstitution, isOwnProofPath } from "../lib/services/institutions";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);

async function main() {
  await prisma.user.createMany({ data: [
    { id: "adm", email: "adm@x.com", displayName: "Admin", isAdmin: true },
    { id: "org", email: "org@x.com", displayName: "Org", kycStatus: "approved" },
    { id: "org2", email: "org2@x.com", displayName: "Org2" },
    { id: "s1", email: "s1@x.com", displayName: "FastStudent" },
    { id: "s2", email: "s2@x.com", displayName: "FastStudent2" },
    { id: "x1", email: "x1@x.com", displayName: "ComsatsStudent" },
    { id: "n1", email: "n1@x.com", displayName: "NoInstitute" },
  ]});
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "FAST Esports" } });
  const org2 = await prisma.organizerProfile.create({ data: { userId: "org2", orgName: "COMSATS Esports" } });
  const mk = (u: string) => prisma.playerProfile.create({ data: { userId: u, firstName: u, lastName: "x" } });
  const [s1, s2, x1, n1] = [await mk("s1"), await mk("s2"), await mk("x1"), await mk("n1")];

  const fast = await createInstitution(org.id, "FAST University");
  const comsats = await createInstitution(org2.id, "COMSATS University");
  if (!("data" in fast) || !("data" in comsats)) return;
  await setInstitutionVerified(fast.data.id, "adm", true);
  await setInstitutionVerified(comsats.data.id, "adm", true);
  const pick = (u: string, id: string) => setPlayerInstitution(u, { institutionId: id, studentId: null, acknowledged: false });
  await pick("s1", fast.data.id); await pick("s2", fast.data.id); await pick("x1", comsats.data.id);

  const game = await prisma.game.create({ data: { name: "TestGame" } });
  const base = { organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 50, format: "single_elimination", entryType: "free", status: "published" } as const;
  const open = await prisma.tournament.create({ data: { ...base, slug: "open-t", name: "Open" } });
  const inst = await prisma.tournament.create({ data: { ...base, slug: "inst-t", name: "Inst", audienceScope: "institution" } });
  const fresh = await prisma.tournament.create({ data: { ...base, slug: "fresh-t", name: "Fresh", audienceScope: "institution", requireFreshInstitutionProof: true } });
  const squad = await prisma.tournament.create({ data: { ...base, slug: "squad-t", name: "Squad", mode: "squad", audienceScope: "institution" } });

  // open tournaments are unaffected
  ok("open: player with no institute can join", !err(await registerForTournament({ tournamentId: open.id, playerId: n1.id })));

  // institution-only: host institute's members only (no co-hosts/guests yet)
  ok("inst: player with no institute blocked", err(await registerForTournament({ tournamentId: inst.id, playerId: n1.id })) === "institution_required");
  ok("inst: other institute's player blocked", err(await registerForTournament({ tournamentId: inst.id, playerId: x1.id })) === "institution_required");
  const r1 = await registerForTournament({ tournamentId: inst.id, playerId: s1.id });
  ok("inst: host institute's member can join, no co-host queue", !err(r1) && "data" in r1 && r1.data?.routedInstitutionId === null);

  // guest institute: allowed in, host still approves (not routed anywhere)
  ok("guest invite ok (no acceptance needed)", "data" in await addTournamentInstitution(inst.id, org.id, comsats.data.id, "guest"));
  const rx = await registerForTournament({ tournamentId: inst.id, playerId: x1.id });
  ok("inst: guest institute's player can now join, host handles them", !err(rx) && "data" in rx && rx.data?.routedInstitutionId === null);

  // fresh proof
  ok("fresh: member but no proof blocked", err(await registerForTournament({ tournamentId: fresh.id, playerId: s1.id })) === "institution_proof_required");
  const withProof = await registerForTournament({ tournamentId: fresh.id, playerId: s1.id, institutionProofPath: "s1/proof.jpg" });
  ok("fresh: with proof ok and path stored", !err(withProof) && "data" in withProof && withProof.data?.institutionProofPath === "s1/proof.jpg");
  ok("fresh: skipping proof does NOT skip membership", err(await registerForTournament({ tournamentId: fresh.id, playerId: n1.id, skipInstitutionProof: true })) === "institution_required");

  // squad: every member must belong to a participating institute
  ok("squad: teammate with no institute blocks", err(await registerForTournament({ tournamentId: squad.id, playerId: s1.id, teamMemberPlayerIds: [n1.id], teamName: "T" })) === "institution_required");
  await addTournamentInstitution(squad.id, org.id, comsats.data.id, "guest");
  ok("squad: players from two different institutes can't be on one team", err(await registerForTournament({ tournamentId: squad.id, playerId: s1.id, teamMemberPlayerIds: [x1.id], teamName: "Mixed" })) === "institution_mixed_team");
  ok("squad: all members in participating institutes ok", !err(await registerForTournament({ tournamentId: squad.id, playerId: s1.id, teamMemberPlayerIds: [s2.id], teamName: "T" })));

  // manual add (organizer vouches for the proof, not for membership)
  ok("manual-add: no institute blocked", err(await manualAddRegistration(inst.id, org.id, "n1@x.com")) === "institution_required");
  ok("manual-add: member ok, no proof needed even on fresh tournament", !err(await manualAddRegistration(fresh.id, org.id, "s2@x.com")));

  // revoked institute: its members no longer qualify
  await setInstitutionVerified(fast.data.id, "adm", false, "test");
  const afterRevoke = await prisma.tournament.create({ data: { ...base, slug: "revoked-t", name: "Revoked", audienceScope: "institution" } });
  ok("host institute unverified: members blocked", err(await registerForTournament({ tournamentId: afterRevoke.id, playerId: s1.id })) === "institution_required");
  ok("host institute unverified: cannot publish institution tournament", err(await publishTournament((await prisma.tournament.create({ data: { ...base, slug: "draft-t", name: "Draft", audienceScope: "institution", status: "draft" } })).id, org.id)) === "institution_host_required");
  await setInstitutionVerified(fast.data.id, "adm", true);
  ok("re-verified: can publish", err(await publishTournament((await prisma.tournament.findFirstOrThrow({ where: { slug: "draft-t" } })).id, org.id)) !== "institution_host_required");

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

  // browse filter
  const only = await listTournaments({ audienceScope: "institution" });
  ok("filter returns only institution tournaments", only.total >= 3 && only.data.every((t) => t.audienceScope === "institution"));

  // proof path safety
  ok("proof path must be in own folder", isOwnProofPath("s1/a.jpg", "s1") && !isOwnProofPath("s2/a.jpg", "s1") && !isOwnProofPath("s1/../s2/a.jpg", "s1") && !isOwnProofPath(undefined, "s1"));
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
