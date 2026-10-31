// Who may open a payment proof, against a real database. Checks the decision only (no files).
// Needs a Postgres with all migrations applied (npm test provides one).
import { prisma } from "../lib/prisma";
import { authorizeProofView, type ProofKindParam } from "../lib/services/proof-access";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const can = async (viewerUserId: string, kind: ProofKindParam, id: string, extra: { side?: string; index?: number } = {}) => {
  const r = await authorizeProofView({ viewerUserId, kind, id, ...extra });
  return "value" in r ? r.value : r.error;
};

async function main() {
  await prisma.user.createMany({ data: [
    { id: "payer", email: "payer@x.com", displayName: "Payer" },
    { id: "teammate", email: "tm@x.com", displayName: "Teammate" },
    { id: "owner", email: "owner@x.com", displayName: "Owner" },
    { id: "staffer", email: "staffer@x.com", displayName: "Staffer" },
    { id: "stranger", email: "stranger@x.com", displayName: "Stranger" },
    { id: "rivalorg", email: "rival@x.com", displayName: "Rival" },
    { id: "boss", email: "boss@x.com", displayName: "Boss", isAdmin: true, staffRole: "super_admin" },
    { id: "mgr", email: "mgr@x.com", displayName: "Manager", isAdmin: true, staffRole: "manager" },
  ]});
  await prisma.staffPermission.create({ data: { userId: "mgr", permission: "approvals", access: "view" } });
  const org = await prisma.organizerProfile.create({ data: { userId: "owner", orgName: "Org" } });
  await prisma.organizerProfile.create({ data: { userId: "rivalorg", orgName: "Rival Org" } });
  await prisma.organizationMember.create({ data: { organizerId: org.id, userId: "staffer", email: "staffer@x.com" } });
  const game = await prisma.game.create({ data: { name: "G" } });
  const t = await prisma.tournament.create({ data: { organizerId: org.id, gameId: game.id, type: "tournament", maxTeams: 10, format: "single_elimination", status: "registration_open", slug: "pa1", name: "Cup", mode: "squad", entryType: "paid" } });
  const pp = await prisma.playerProfile.create({ data: { userId: "payer", firstName: "P", lastName: "x", birthDate: new Date("2000-01-01") } });
  const tp = await prisma.playerProfile.create({ data: { userId: "teammate", firstName: "T", lastName: "x", birthDate: new Date("2000-01-01") } });
  const team = await prisma.teamEntry.create({ data: { tournamentId: t.id, name: "Team", members: { create: [{ playerId: pp.id }, { playerId: tp.id }] } } });
  const reg = await prisma.registration.create({ data: { tournamentId: t.id, teamEntryId: team.id, paymentProofUrl: "payer/payment-proofs/aaaaaaaa-1.png", payerUserId: "payer" } });

  // ---- registration proofs
  ok("the payer can open their proof", (await can("payer", "registration", reg.id)) === "payer/payment-proofs/aaaaaaaa-1.png");
  ok("a teammate who didn't pay can NOT", (await can("teammate", "registration", reg.id)) === "forbidden");
  ok("the organizer owner can", (await can("owner", "registration", reg.id)) !== "forbidden");
  ok("someone on the organizer's team can", (await can("staffer", "registration", reg.id)) !== "forbidden");
  ok("a stranger can NOT", (await can("stranger", "registration", reg.id)) === "forbidden");
  ok("another organizer can NOT", (await can("rivalorg", "registration", reg.id)) === "forbidden");
  ok("an admin with Approvals can", (await can("mgr", "registration", reg.id)) !== "forbidden");
  ok("a super admin can", (await can("boss", "registration", reg.id)) !== "forbidden");
  ok("an entry with no proof is not found", (await can("payer", "registration", (await prisma.registration.create({ data: { tournamentId: t.id, payerUserId: "payer" } })).id)) === "not_found");

  // ---- plan requests (admins with Payments only)
  const plan = await prisma.plan.findFirst();
  if (plan) {
    const pr = await prisma.planRequest.create({ data: { userId: "payer", audience: plan.audience, planCode: plan.code, proofUrl: "payer/plan-proofs/bbbbbbbb-2.png" } });
    ok("plan payment: the payer can", (await can("payer", "plan_request", pr.id)) !== "forbidden");
    ok("plan payment: a manager with only Approvals can NOT", (await can("mgr", "plan_request", pr.id)) === "forbidden");
    ok("plan payment: a stranger can NOT", (await can("stranger", "plan_request", pr.id)) === "forbidden");
    ok("plan payment: a super admin can", (await can("boss", "plan_request", pr.id)) !== "forbidden");
  }

  // ---- club fee
  const club = await prisma.clubProfile.create({ data: { userId: "payer", clubName: "FC", feeProofUrl: "payer/club-fee-proofs/cccccccc-3.png" } });
  ok("club fee: the owner can, a stranger can NOT, an Approvals admin can", (await can("payer", "club_fee", club.id)) !== "forbidden" && (await can("stranger", "club_fee", club.id)) === "forbidden" && (await can("mgr", "club_fee", club.id)) !== "forbidden");

  // ---- dispute evidence
  const d = await prisma.paymentDispute.create({ data: {
    registrationId: reg.id, tournamentId: t.id, organizerId: org.id, payerUserId: "payer", organizerUserId: "owner",
    kind: "wrong_amount", openedByUserId: "payer", reason: "wrong amount taken", responseDueAt: new Date(Date.now() + 86_400_000),
    openerEvidenceUrls: ["payer/dispute-evidence/dddddddd-4.png", "payer/dispute-evidence/dddddddd-5.png"],
    responderEvidenceUrls: ["owner/dispute-evidence/eeeeeeee-6.png"],
  } });
  ok("dispute: the player opens their own evidence by position", (await can("payer", "dispute", d.id, { side: "opener", index: 1 })) === "payer/dispute-evidence/dddddddd-5.png");
  ok("dispute: the organizer sees the player's evidence and their own", (await can("owner", "dispute", d.id, { side: "opener" })) !== "forbidden" && (await can("owner", "dispute", d.id, { side: "responder" })) === "owner/dispute-evidence/eeeeeeee-6.png");
  ok("dispute: a stranger and a teammate can NOT", (await can("stranger", "dispute", d.id)) === "forbidden" && (await can("teammate", "dispute", d.id)) === "forbidden");
  ok("dispute: an admin with Approvals can", (await can("mgr", "dispute", d.id)) !== "forbidden");
  ok("dispute: a position past the last file is not found", (await can("payer", "dispute", d.id, { side: "opener", index: 5 })) === "not_found");

  if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
  console.log("\nall passed");
}
main().catch((e) => { console.error("FAIL crashed", e); process.exit(1); }).finally(() => prisma.$disconnect());
