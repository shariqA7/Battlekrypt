// Cheating and no-shows: who can disqualify / report / revoke, and the penalty the
// ORGANIZER chose for no-shows. Needs a Postgres with all migrations applied.
// See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { registerForTournament, approveRegistration, listRegistrations } from "../lib/services/tournaments";
import { createInstitution, setInstitutionVerified, setPlayerInstitution, addTournamentInstitution, respondToCoHostInvite } from "../lib/services/institutions";
import { disqualifyRegistration, reportNoShow, revokePenalty, setNoShowPolicy, listActivePenalties } from "../lib/services/penalties";
import { setCheckInStatus } from "../lib/services/venue";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r && (r as { error?: string }).error ? (r as { error: string }).error : null);
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const users = ["adm", "fast", "comsats", "lums", "other", ...Array.from({ length: 12 }, (_, i) => `p${i}`)];
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
  const prof: string[] = [];
  const homes = ["fast", "fast", "fast", "comsats", "comsats", "comsats", "lums", "lums", "fast", "comsats", "fast", "comsats"];
  for (let i = 0; i < 12; i++) {
    prof.push((await prisma.playerProfile.create({ data: { birthDate: new Date("2000-01-01"), userId: `p${i}`, firstName: `p${i}`, lastName: "x", planCode: "player_basic" } })).id);
    await setPlayerInstitution(`p${i}`, { institutionId: inst[homes[i]], studentId: null, acknowledged: false }, new Date(Date.now() - 30 * DAY));
  }
  const game = await prisma.game.create({ data: { name: "G", isApproved: true } });
  const t0 = { organizerId: org.fast.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 50, format: "single_elimination", status: "registration_open", audienceScope: "institution", entryType: "free" } as const;
  const mkT = async (slug: string, extra: Record<string, unknown> = {}) => {
    const t = await prisma.tournament.create({ data: { ...t0, slug, name: `Cup ${slug}`, ...extra } as never });
    const c = await addTournamentInstitution(t.id, org.fast.id, inst.comsats, "cohost");
    if ("data" in c) await respondToCoHostInvite(c.data.id, org.comsats.id, true);
    await addTournamentInstitution(t.id, org.fast.id, inst.lums, "guest");
    return t;
  };
  const enter = async (t: { id: string }, i: number) => {
    const r = await registerForTournament({ tournamentId: t.id, playerId: prof[i] });
    if (!("data" in r) || !r.data) throw new Error("enter failed " + JSON.stringify(r));
    await approveRegistration(r.data.id, org.fast.id); // approved by the host (always allowed)
    return r.data.id;
  };
  const notes = (u: string, type: string) => prisma.notification.findMany({ where: { userId: u, type } });

  // =============== DISQUALIFY: who may
  const t1 = await mkT("dq");
  const eFast2 = await enter(t1, 1);
  const eFast = await enter(t1, 0), eCom = await enter(t1, 3), eCom2 = await enter(t1, 4), eLums = await enter(t1, 6), eCom3 = await enter(t1, 5);
  ok("a reason is required", err(await disqualifyRegistration(eFast, org.fast.id, "   ")) === "reason_required");
  ok("an over-long reason is refused", err(await disqualifyRegistration(eFast, org.fast.id, "x".repeat(501))) === "reason_too_long");
  ok("the host disqualifies its own institute's player", !err(await disqualifyRegistration(eFast, org.fast.id, "Used an emulator")));
  const dq = await prisma.registration.findUniqueOrThrow({ where: { id: eFast } });
  ok("the entry is disqualified, with who and when", dq.status === "disqualified" && dq.disqualifiedReason === "Used an emulator" && dq.disqualifiedAt !== null && dq.disqualifiedByUserId === "fast" && dq.disqualifiedByInstitutionId === inst.fast);
  const pen = await prisma.penalty.findMany({ where: { registrationId: eFast } });
  ok("and it is in the penalty log (cheating, by the host institute)", pen.length === 1 && pen[0].kind === "disqualification" && pen[0].cause === "cheating" && pen[0].issuedByInstitutionId === inst.fast);
  ok("disqualifying twice is refused", err(await disqualifyRegistration(eFast, org.fast.id, "again")) === "already_disqualified");

  ok("a co-host CAN disqualify its own institute's entry", !err(await disqualifyRegistration(eCom, org.comsats.id, "Smurfing in the semi-final")));
  const dq2 = await prisma.registration.findUniqueOrThrow({ where: { id: eCom } });
  ok("...recorded against the co-host institute", dq2.status === "disqualified" && dq2.disqualifiedByUserId === "comsats" && dq2.disqualifiedByInstitutionId === inst.comsats);
  ok("a co-host can NOT disqualify the host's player", err(await disqualifyRegistration(eFast2, org.comsats.id, "x")) === "forbidden");
  ok("a co-host can NOT disqualify a guest institute's player", err(await disqualifyRegistration(eLums, org.comsats.id, "x")) === "forbidden");
  ok("a guest institute can NOT disqualify anyone", err(await disqualifyRegistration(eLums, org.lums.id, "x")) === "forbidden");
  ok("an unrelated organization can NOT", err(await disqualifyRegistration(eCom2, org.other.id, "x")) === "forbidden");
  ok("the host CAN disqualify a co-host's player", !err(await disqualifyRegistration(eCom2, org.fast.id, "Account sharing")));

  // two co-hosts must not reach each other's entries
  const t2 = await mkT("two");
  const c2 = await addTournamentInstitution(t2.id, org.fast.id, inst.lums, "cohost"); // lums was guest -> already added; use a 3rd institute instead
  void c2;
  await prisma.tournamentInstitution.update({ where: { tournamentId_institutionId: { tournamentId: t2.id, institutionId: inst.lums } }, data: { role: "cohost", status: "accepted" } });
  const eC = await enter(t2, 9), eL = await enter(t2, 7);
  ok("co-host A can NOT disqualify co-host B's entry (and vice versa)", err(await disqualifyRegistration(eC, org.lums.id, "x")) === "forbidden" && err(await disqualifyRegistration(eL, org.comsats.id, "x")) === "forbidden");
  await prisma.tournamentInstitution.update({ where: { tournamentId_institutionId: { tournamentId: t2.id, institutionId: inst.comsats } }, data: { status: "declined" } });
  ok("a co-host that is no longer accepted loses the power", err(await disqualifyRegistration(eC, org.comsats.id, "x")) === "forbidden");

  // other guards
  const rej = await enter(t1, 10);
  await prisma.registration.update({ where: { id: rej }, data: { status: "rejected" } });
  ok("a rejected entry can't be disqualified", err(await disqualifyRegistration(rej, org.fast.id, "x")) === "not_active");
  const otherRule = await prisma.tournamentRule.create({ data: { tournamentId: t2.id, description: "No emulators", action: "disqualification" } });
  const ownRule = await prisma.tournamentRule.create({ data: { tournamentId: t1.id, description: "No smurfing", action: "disqualification" } });
  const eRule = await enter(t1, 11);
  ok("a rule from another tournament is refused", err(await disqualifyRegistration(eRule, org.fast.id, "x", otherRule.id)) === "invalid_rule");
  ok("this tournament's own rule is recorded", !err(await disqualifyRegistration(eRule, org.fast.id, "Smurfing", ownRule.id)) && (await prisma.registration.findUniqueOrThrow({ where: { id: eRule } })).disqualifiedRuleId === ownRule.id);

  // =============== notifications
  ok("the entrant is told they were disqualified", (await notes("p0", "penalty_issued")).some((n) => n.title.includes("disqualified") && n.body === "Used an emulator"));
  ok("the host is told when a CO-HOST disqualifies", (await notes("fast", "penalty_by_cohost")).some((n) => n.title.includes("comsats university")));
  ok("a co-host is told when the HOST disqualifies its player", (await notes("comsats", "penalty_on_your_player")).some((n) => n.title.includes("disqualified")));
  const before = (await notes("comsats", "penalty_on_your_player")).length;
  await disqualifyRegistration(eFast2, org.fast.id, "Boosting");
  ok("the host disqualifying its OWN player alerts no co-host", (await notes("comsats", "penalty_on_your_player")).length === before);
  ok("unrelated organizations hear nothing", (await prisma.notification.count({ where: { userId: "other" } })) === 0);

  // =============== a disqualified entry frees the institute's slot
  const tq = await mkT("quota", { maxEntriesPerInstitute: 1 });
  const q1 = await enter(tq, 0);
  ok("limit 1: a second entry from the institute is refused", err(await registerForTournament({ tournamentId: tq.id, playerId: prof[1] })) === "institution_quota_full");
  await disqualifyRegistration(q1, org.fast.id, "cheating");
  ok("after disqualifying the first, the institute can enter another (a disqualified entry frees its slot)", !err(await registerForTournament({ tournamentId: tq.id, playerId: prof[1] })));

  // =============== NO-SHOW POLICY: the organizer decides
  const t3 = await mkT("policy");
  ok("only the host sets the policy", err(await setNoShowPolicy(t3.id, org.comsats.id, { penalty: "warning" })) === "forbidden" && err(await setNoShowPolicy(t3.id, org.other.id, { penalty: "warning" })) === "forbidden");
  ok("an unknown penalty is refused", err(await setNoShowPolicy(t3.id, org.fast.id, { penalty: "ban" as never })) === "invalid_penalty");
  ok("a point deduction needs points", err(await setNoShowPolicy(t3.id, org.fast.id, { penalty: "point_deduction" })) === "points_required");
  ok("points must be 1..1000", err(await setNoShowPolicy(t3.id, org.fast.id, { penalty: "point_deduction", points: 0 })) === "points_invalid" && err(await setNoShowPolicy(t3.id, org.fast.id, { penalty: "point_deduction", points: 1001 })) === "points_invalid" && err(await setNoShowPolicy(t3.id, org.fast.id, { penalty: "point_deduction", points: 2.5 })) === "points_invalid");
  await setNoShowPolicy(t3.id, org.fast.id, { penalty: "point_deduction", points: 5 });
  ok("the policy is saved", (await prisma.tournament.findUniqueOrThrow({ where: { id: t3.id } })).noShowPenalty === "point_deduction");
  await setNoShowPolicy(t3.id, org.fast.id, { penalty: "warning", points: 9 });
  const pol = await prisma.tournament.findUniqueOrThrow({ where: { id: t3.id } });
  ok("switching to something else clears the points", pol.noShowPenalty === "warning" && pol.noShowPenaltyPoints === null);

  // =============== REPORT A NO-SHOW
  const n1 = await enter(t3, 3), n2 = await enter(t3, 0), n3 = await enter(t3, 4);
  const w = await reportNoShow(n1, org.comsats.id, { note: "Didn't join the lobby" });
  ok("a co-host reports a no-show for its own player: the organizer's penalty (warning) applies", !err(w) && "data" in w && w.data?.kind === "warning" && w.data?.cause === "no_show" && w.data?.reason === "No-show: Didn't join the lobby");
  ok("...and the entry stays in the tournament", (await prisma.registration.findUniqueOrThrow({ where: { id: n1 } })).status === "approved");
  ok("reporting the same no-show twice is refused", err(await reportNoShow(n1, org.comsats.id)) === "already_reported");
  ok("a co-host can NOT report the host's player", err(await reportNoShow(n2, org.comsats.id)) === "forbidden");
  ok("a co-host can NOT choose a different penalty", err(await reportNoShow(n3, org.comsats.id, { penalty: "disqualification" })) === "only_organizer_chooses");
  ok("(naming the SAME penalty as the policy is fine)", !err(await reportNoShow(n3, org.comsats.id, { penalty: "warning" })));
  ok("the entrant is told", (await notes("p3", "penalty_issued")).some((n) => n.title.includes("warning")));
  ok("the host is told a co-host reported it", (await notes("fast", "penalty_by_cohost")).some((n) => n.title.includes("warned")));

  await setNoShowPolicy(t3.id, org.fast.id, { penalty: "point_deduction", points: 7 });
  const n4 = await enter(t3, 8);
  const pts = await reportNoShow(n4, org.fast.id);
  ok("a point-deduction policy records the points", !err(pts) && "data" in pts && pts.data?.kind === "point_deduction" && pts.data?.points === 7);
  ok("...the entry is not disqualified", (await prisma.registration.findUniqueOrThrow({ where: { id: n4 } })).status === "approved");

  await setNoShowPolicy(t3.id, org.fast.id, { penalty: "disqualification" });
  const n5 = await enter(t3, 5);
  const dqn = await reportNoShow(n5, org.comsats.id);
  const r5 = await prisma.registration.findUniqueOrThrow({ where: { id: n5 } });
  ok("a disqualification policy disqualifies the no-show", !err(dqn) && r5.status === "disqualified" && r5.disqualifiedReason === "No-show");

  await setNoShowPolicy(t3.id, org.fast.id, { penalty: "none" });
  const n6 = await enter(t3, 10);
  ok("with no policy, a reported no-show is refused with a clear reason", err(await reportNoShow(n6, org.fast.id)) === "no_penalty_configured");
  const ov = await reportNoShow(n6, org.fast.id, { penalty: "warning" });
  ok("...but the HOST can choose a penalty for this case", !err(ov) && "data" in ov && ov.data?.kind === "warning");
  const n7 = await enter(t3, 11);
  ok("an override of point deduction needs points", err(await reportNoShow(n7, org.fast.id, { penalty: "point_deduction" })) === "points_required");
  ok("...and takes the host's number", "data" in (await reportNoShow(n7, org.fast.id, { penalty: "point_deduction", points: 12 })) && (await prisma.penalty.findFirstOrThrow({ where: { registrationId: n7 } })).points === 12);

  // =============== ON-SITE (LAN) CHECK-IN applies the policy
  const lan = await mkT("lan", { venueType: "lan", venueName: "Arena", venueCity: "Lahore", noShowPenalty: "disqualification" });
  const l1 = await enter(lan, 0), l2 = await enter(lan, 3);
  ok("a co-host can now mark ITS OWN entry checked in", !err(await setCheckInStatus(l2, org.comsats.id, "checked_in")));
  ok("a co-host can NOT mark the host's entry", err(await setCheckInStatus(l1, org.comsats.id, "no_show")) === "forbidden");
  await setCheckInStatus(l1, org.fast.id, "no_show");
  const lr = await prisma.registration.findUniqueOrThrow({ where: { id: l1 } });
  ok("marking a no-show on site applies the organizer's penalty (here: disqualification)", lr.checkInStatus === "no_show" && lr.status === "disqualified" && (await prisma.penalty.count({ where: { registrationId: l1, cause: "no_show", revokedAt: null } })) === 1);
  await setCheckInStatus(l1, org.fast.id, "pending");
  const lu = await prisma.registration.findUniqueOrThrow({ where: { id: l1 } });
  ok("un-marking it takes the penalty back and the entry is back in", lu.checkInStatus === "pending" && lu.status === "approved" && lu.disqualifiedReason === null && lu.disqualifiedAt === null);
  ok("...the log keeps the (revoked) row", (await prisma.penalty.findMany({ where: { registrationId: l1 } })).every((p) => p.revokedAt !== null));
  await setCheckInStatus(l1, org.fast.id, "no_show");
  ok("marking it again works and penalises again", (await prisma.registration.findUniqueOrThrow({ where: { id: l1 } })).status === "disqualified");
  await prisma.tournament.update({ where: { id: lan.id }, data: { noShowPenalty: "none" } });
  const l3 = await enter(lan, 1);
  await setCheckInStatus(l3, org.fast.id, "no_show");
  ok("with policy 'none', on-site no-show just records the check-in state", (await prisma.penalty.count({ where: { registrationId: l3 } })) === 0 && (await prisma.registration.findUniqueOrThrow({ where: { id: l3 } })).checkInStatus === "no_show");
  await prisma.tournament.update({ where: { id: lan.id }, data: { noShowPenalty: "warning" } });
  const l4 = await enter(lan, 8);
  await reportNoShow(l4, org.fast.id);
  ok("reporting a no-show on an on-site tournament also marks the check-in state", (await prisma.registration.findUniqueOrThrow({ where: { id: l4 } })).checkInStatus === "no_show");

  // =============== REVOKING
  const t4 = await mkT("revoke");
  const v1 = await enter(t4, 3), v2 = await enter(t4, 0);
  await disqualifyRegistration(v1, org.comsats.id, "by comsats");
  await disqualifyRegistration(v2, org.fast.id, "by host");
  const pv1 = await prisma.penalty.findFirstOrThrow({ where: { registrationId: v1 } });
  const pv2 = await prisma.penalty.findFirstOrThrow({ where: { registrationId: v2 } });
  ok("a co-host can NOT revoke the host's penalty on its player", err(await revokePenalty(await (async () => { const e = await enter(t4, 4); await disqualifyRegistration(e, org.fast.id, "host dq"); return (await prisma.penalty.findFirstOrThrow({ where: { registrationId: e } })).id; })(), org.comsats.id)) === "forbidden");
  ok("a co-host can NOT revoke a penalty on the host's player", err(await revokePenalty(pv2.id, org.comsats.id)) === "forbidden");
  ok("an unrelated organization can NOT revoke", err(await revokePenalty(pv1.id, org.other.id)) === "forbidden");
  ok("a co-host CAN revoke the penalty it issued", !err(await revokePenalty(pv1.id, org.comsats.id)));
  const back = await prisma.registration.findUniqueOrThrow({ where: { id: v1 } });
  ok("the entry is back in (approved again) and the disqualification fields are cleared", back.status === "approved" && back.disqualifiedReason === null && back.disqualifiedByUserId === null && back.disqualifiedByInstitutionId === null);
  ok("revoking twice is refused", err(await revokePenalty(pv1.id, org.comsats.id)) === "already_revoked");
  ok("the entrant is told it was withdrawn", (await notes("p3", "penalty_revoked")).length >= 1);
  ok("the host CAN revoke any penalty", !err(await revokePenalty(pv2.id, org.fast.id)) && (await prisma.registration.findUniqueOrThrow({ where: { id: v2 } })).status === "approved");
  // an entry that was never approved goes back to pending
  const pend = await registerForTournament({ tournamentId: t4.id, playerId: prof[9] });
  const pendId = "data" in pend && pend.data ? pend.data.id : "";
  await disqualifyRegistration(pendId, org.fast.id, "x");
  await revokePenalty((await prisma.penalty.findFirstOrThrow({ where: { registrationId: pendId } })).id, org.fast.id);
  ok("an entry that was never approved goes back to pending, not approved", (await prisma.registration.findUniqueOrThrow({ where: { id: pendId } })).status === "pending");
  // two standing disqualifications: revoking one must not free the entry
  const v3 = await enter(t4, 10);
  await disqualifyRegistration(v3, org.fast.id, "first");
  const first = await prisma.penalty.findFirstOrThrow({ where: { registrationId: v3 } });
  await prisma.penalty.create({ data: { registrationId: v3, tournamentId: t4.id, kind: "disqualification", cause: "other", reason: "second", issuedByUserId: "fast" } });
  await revokePenalty(first.id, org.fast.id);
  ok("revoking ONE of two disqualifications leaves the entry disqualified", (await prisma.registration.findUniqueOrThrow({ where: { id: v3 } })).status === "disqualified");

  // =============== READING
  const view = await listRegistrations(t3.id, org.fast.id);
  const mine = await listRegistrations(t3.id, org.comsats.id);
  ok("the host's queue shows each entry's standing penalties", "data" in view && !!view.data && view.data.some((r) => r.id === n1 && r.penalties.length === 1 && r.penalties[0].kind === "warning"));
  ok("the co-host's queue shows them for its own entries only", "data" in mine && !!mine.data && mine.data.every((r) => r.routedInstitutionId === inst.comsats) && mine.data.some((r) => r.id === n1 && r.penalties.length === 1));
  const map = await listActivePenalties([v1, v2, v3]);
  ok("revoked penalties don't count as standing", !map.has(v1) && !map.has(v2) && (map.get(v3)?.length ?? 0) === 1);
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
