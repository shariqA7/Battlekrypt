// Co-host institutes: routing, queues, and who may approve/reject whom.
// Needs a Postgres with all migrations applied. See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { registerForTournament, listRegistrations, approveRegistration, rejectRegistration } from "../lib/services/tournaments";
import {
  createInstitution, setInstitutionVerified, setPlayerInstitution,
  addTournamentInstitution, removeTournamentInstitution, respondToCoHostInvite, listCoHostInvitations,
} from "../lib/services/institutions";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const ids = (r: { data?: { id: string }[] } | { error: string }) => ("data" in r && r.data ? r.data.map((x) => x.id).sort() : []);

async function main() {
  const users = ["adm", "fast", "comsats", "lums", "other", "p_f1", "p_f2", "p_c1", "p_c2", "p_c3", "p_l1"];
  await prisma.user.createMany({ data: users.map((u) => ({ id: u, email: `${u}@x.com`, displayName: u, isAdmin: u === "adm" })) });
  const org = Object.fromEntries(await Promise.all(["fast", "comsats", "lums", "other"].map(async (u) =>
    [u, await prisma.organizerProfile.create({ data: { userId: u, orgName: `${u} esports` } })] as const)));
  const inst: Record<string, string> = {};
  for (const u of ["fast", "comsats", "lums"]) {
    const r = await createInstitution(org[u].id, `${u} university`);
    if (!("data" in r)) throw new Error("institute create failed");
    inst[u] = r.data.id;
    await setInstitutionVerified(r.data.id, "adm", true);
  }
  const prof: Record<string, string> = {};
  for (const [u, i] of [["p_f1", "fast"], ["p_f2", "fast"], ["p_c1", "comsats"], ["p_c2", "comsats"], ["p_c3", "comsats"], ["p_l1", "lums"]] as const) {
    prof[u] = (await prisma.playerProfile.create({ data: { userId: u, firstName: u, lastName: "x" } })).id;
    await setPlayerInstitution(u, { institutionId: inst[i], studentId: null, acknowledged: false });
  }
  const game = await prisma.game.create({ data: { name: "G" } });
  const base = { organizerId: org.fast.id, gameId: game.id, type: "tournament", maxTeams: 50, format: "single_elimination", status: "published", audienceScope: "institution" } as const;
  const t = await prisma.tournament.create({ data: { ...base, slug: "t1", name: "FAST Cup", mode: "solo", entryType: "free" } });
  const paid = await prisma.tournament.create({ data: { ...base, slug: "t2", name: "Paid Cup", mode: "solo", entryType: "paid" } });
  const squad = await prisma.tournament.create({ data: { ...base, slug: "t3", name: "Squad Cup", mode: "squad", entryType: "free" } });
  const openT = await prisma.tournament.create({ data: { ...base, slug: "t4", name: "Open Cup", mode: "solo", entryType: "free", audienceScope: "open" } });

  // --- inviting
  ok("only the host can add institutes", err(await addTournamentInstitution(t.id, org.comsats.id, inst.lums, "guest")) === "forbidden");
  ok("not on an open tournament", err(await addTournamentInstitution(openT.id, org.fast.id, inst.comsats, "cohost")) === "not_institution_tournament");
  ok("host can't add itself", err(await addTournamentInstitution(t.id, org.fast.id, inst.fast, "cohost")) === "is_host");
  const inv = await addTournamentInstitution(t.id, org.fast.id, inst.comsats, "cohost");
  ok("co-host invite created", "data" in inv);
  ok("duplicate invite rejected", err(await addTournamentInstitution(t.id, org.fast.id, inst.comsats, "guest")) === "already_added");
  ok("guest added", "data" in await addTournamentInstitution(t.id, org.fast.id, inst.lums, "guest"));
  if (!("data" in inv)) return;

  // before the co-host accepts, its players are not allowed in
  ok("pending co-host: its players still blocked", err(await registerForTournament({ tournamentId: t.id, playerId: prof.p_c1 })) === "institution_required");
  const invites = await listCoHostInvitations(org.comsats.id);
  ok("invited organization sees the invite", invites.length === 1 && invites[0].status === "pending");
  ok("a different organization can't answer it", err(await respondToCoHostInvite(inv.data.id, org.lums.id, true)) === "forbidden");
  ok("accept ok", "data" in await respondToCoHostInvite(inv.data.id, org.comsats.id, true));
  ok("can't answer twice", err(await respondToCoHostInvite(inv.data.id, org.comsats.id, false)) === "already_responded");

  // --- routing
  const rf = await registerForTournament({ tournamentId: t.id, playerId: prof.p_f1 });
  const rc1 = await registerForTournament({ tournamentId: t.id, playerId: prof.p_c1 });
  const rc2 = await registerForTournament({ tournamentId: t.id, playerId: prof.p_c2 });
  const rl = await registerForTournament({ tournamentId: t.id, playerId: prof.p_l1 });
  if (!("data" in rf && rf.data && "data" in rc1 && rc1.data && "data" in rc2 && rc2.data && "data" in rl && rl.data)) { console.log("FAIL setup registrations"); fails++; return; }
  ok("host's own member -> host queue", rf.data.routedInstitutionId === null);
  ok("co-host's member -> co-host queue", rc1.data.routedInstitutionId === inst.comsats && rc2.data.routedInstitutionId === inst.comsats);
  ok("guest institute's member -> host queue", rl.data.routedInstitutionId === null);
  const sq = await addTournamentInstitution(squad.id, org.fast.id, inst.comsats, "cohost");
  if ("data" in sq) await respondToCoHostInvite(sq.data.id, org.comsats.id, true);
  const sameTeam = await registerForTournament({ tournamentId: squad.id, playerId: prof.p_c1, teamMemberPlayerIds: [prof.p_c2], teamName: "CC" });
  const mixedTeam = await registerForTournament({ tournamentId: squad.id, playerId: prof.p_f1, teamMemberPlayerIds: [prof.p_c3], teamName: "FC" });
  ok("team from one co-host institute -> that co-host's queue", "data" in sameTeam && sameTeam.data?.routedInstitutionId === inst.comsats && sameTeam.data?.institutionId === inst.comsats);
  ok("mixed-institute team is refused (a team plays for ONE institute)", err(mixedTeam) === "institution_mixed_team");

  // --- queues
  const all = await listRegistrations(t.id, org.fast.id);
  ok("host sees all requests", JSON.stringify(ids(all)) === JSON.stringify([rf.data.id, rc1.data.id, rc2.data.id, rl.data.id].sort()) && "role" in all && all.role === "host");
  const mine = await listRegistrations(t.id, org.fast.id, undefined, "mine");
  ok("host 'my requests' excludes the co-host's queue", JSON.stringify(ids(mine)) === JSON.stringify([rf.data.id, rl.data.id].sort()));
  const theirs = await listRegistrations(t.id, org.comsats.id);
  ok("co-host sees only its own institute's players", JSON.stringify(ids(theirs)) === JSON.stringify([rc1.data.id, rc2.data.id].sort()) && "role" in theirs && theirs.role === "cohost");
  ok("guest institute's organization sees nothing", err(await listRegistrations(t.id, org.lums.id)) === "forbidden");
  ok("unrelated organization sees nothing", err(await listRegistrations(t.id, org.other.id)) === "forbidden");

  // --- approve / reject
  ok("co-host can approve its own player", "data" in await approveRegistration(rc1.data.id, org.comsats.id));
  ok("...and it is approved (free tournament)", (await prisma.registration.findUnique({ where: { id: rc1.data.id } }))?.status === "approved");
  ok("co-host can reject its own player", "data" in await rejectRegistration(rc2.data.id, org.comsats.id));
  ok("...and it is rejected", (await prisma.registration.findUnique({ where: { id: rc2.data.id } }))?.status === "rejected");
  ok("co-host can NOT approve the host's player", err(await approveRegistration(rf.data.id, org.comsats.id)) === "forbidden");
  ok("co-host can NOT reject the host's player", err(await rejectRegistration(rf.data.id, org.comsats.id)) === "forbidden");
  ok("co-host can NOT touch a guest institute's player", err(await approveRegistration(rl.data.id, org.comsats.id)) === "forbidden");
  ok("guest institute can NOT approve anyone", err(await approveRegistration(rl.data.id, org.lums.id)) === "forbidden");
  ok("unrelated organization can NOT approve", err(await approveRegistration(rf.data.id, org.other.id)) === "forbidden");
  ok("an institute that isn't a co-host of this tournament can NOT act on its entries", "data" in sameTeam && !!sameTeam.data && err(await approveRegistration(sameTeam.data.id, org.lums.id)) === "forbidden");
  ok("host can approve anyone, including the co-host's queue", "data" in await approveRegistration(rf.data.id, org.fast.id) && "data" in await rejectRegistration(rc1.data.id, org.fast.id));

  // --- removing an institute
  ok("can't remove a co-host with active players", err(await removeTournamentInstitution(squad.id, org.fast.id, inst.comsats)) === "has_registrations");
  ok("only the host can remove", err(await removeTournamentInstitution(t.id, org.comsats.id, inst.comsats)) === "forbidden");
  // all of COMSATS's registrations in t are now rejected -> removal allowed
  ok("co-host with no active players can be removed", "data" in await removeTournamentInstitution(t.id, org.fast.id, inst.comsats));
  ok("removed co-host can no longer see the queue", err(await listRegistrations(t.id, org.comsats.id)) === "forbidden");

  // --- paid tournament: co-host confirms eligibility, host confirms payment
  const pi = await addTournamentInstitution(paid.id, org.fast.id, inst.comsats, "cohost");
  if ("data" in pi) await respondToCoHostInvite(pi.data.id, org.comsats.id, true);
  const rp = await registerForTournament({ tournamentId: paid.id, playerId: prof.p_c1, paymentProofUrl: "https://x/receipt.png" });
  if (!("data" in rp && rp.data)) { console.log("FAIL paid registration", JSON.stringify(rp)); fails++; return; }
  const ca = await approveRegistration(rp.data.id, org.comsats.id);
  const after = await prisma.registration.findUnique({ where: { id: rp.data.id } });
  ok("co-host approving a PAID entry doesn't approve it or mark it paid", "data" in ca && ca.awaitingHostPayment === true && after?.status === "pending" && after.paymentStatus === "unpaid" && after.institutionApprovedAt !== null);
  const ha = await approveRegistration(rp.data.id, org.fast.id);
  const after2 = await prisma.registration.findUnique({ where: { id: rp.data.id } });
  ok("host's approval confirms payment and approves", "data" in ha && after2?.status === "approved" && after2.paymentStatus === "paid");

  // --- declined invite
  const di = await addTournamentInstitution(openT.id, org.fast.id, inst.lums, "cohost");
  ok("(open tournaments can't have co-hosts)", err(di) === "not_institution_tournament");
  const t5 = await prisma.tournament.create({ data: { ...base, slug: "t5", name: "Cup 5", mode: "solo", entryType: "free" } });
  const dinv = await addTournamentInstitution(t5.id, org.fast.id, inst.lums, "cohost");
  if ("data" in dinv) {
    ok("decline ok", "data" in await respondToCoHostInvite(dinv.data.id, org.lums.id, false));
    ok("declined co-host's players stay blocked", err(await registerForTournament({ tournamentId: t5.id, playerId: prof.p_l1 })) === "institution_required");
  }

  // --- routing is a snapshot: later institute changes don't strand a registration
  const snap = await registerForTournament({ tournamentId: t5.id, playerId: prof.p_f2 });
  void snap;
  const t6 = await prisma.tournament.create({ data: { ...base, slug: "t6", name: "Cup 6", mode: "solo", entryType: "free" } });
  const i6 = await addTournamentInstitution(t6.id, org.fast.id, inst.comsats, "cohost");
  if ("data" in i6) await respondToCoHostInvite(i6.data.id, org.comsats.id, true);
  const r6 = await registerForTournament({ tournamentId: t6.id, playerId: prof.p_c1 });
  await prisma.playerInstitution.update({ where: { playerId: prof.p_c1 }, data: { institutionId: inst.lums } });
  const q6 = await listRegistrations(t6.id, org.comsats.id);
  ok("co-host still sees a player who later changed institute", "data" in r6 && r6.data !== undefined && JSON.stringify(ids(q6)) === JSON.stringify([r6.data.id]));
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
