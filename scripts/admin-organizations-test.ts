// Admin → Organizations: paged user search, adding an organization or institute (with the
// admin doing the identity check), the paged list, and the detail page's queries.
// Needs a Postgres with all migrations applied, plus IDENTITY_HASH_SECRET and
// PAYOUT_ENCRYPTION_KEY (64 hex characters). See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { searchUsersPage, adminCreateOrganization, listOrganizationsPage, adminAssignOrganizerPlan } from "../lib/services/admin-organizations";
import { getOrganizationDetail } from "../lib/services/admin-organization-detail";
import { referencedIdentityPaths } from "../lib/services/identity";
import { listUsersPage, listClubsPage } from "../lib/services/admin-lists";
import { requestInstituteProofView } from "../lib/services/institutions";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);

const kyc = (uid: string, over = {}) => ({
  docType: "nic", fullName: "Ali Raza Khan", documentNumber: "35202-1234567-1", address: "House 4, Street 2, Lahore",
  frontPath: `${uid}/a.jpg`, backPath: `${uid}/b.jpg`, selfiePath: `${uid}/c.jpg`, checked: true, ...over,
});
const inst = (uid: string, over = {}) => ({ kind: "university", verified: true, proofPath: `${uid}/proof.jpg`, ...over });

async function main() {
  process.env.IDENTITY_HASH_SECRET ||= "test-secret-test-secret-test-secret-1234";
  process.env.PAYOUT_ENCRYPTION_KEY ||= "a".repeat(64);

  await prisma.user.create({ data: { id: "adm", email: "adm@x.com", displayName: "Admin", isAdmin: true } });
  // 25 people so the picker has to page.
  await prisma.user.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ id: `p${String(i).padStart(2, "0")}`, email: `p${i}@x.com`, displayName: `Person ${i}`, createdAt: new Date(Date.UTC(2026, 0, 1 + i)) })) });
  await prisma.user.createMany({ data: ["orgA", "inst1", "inst2", "bad", "dup"].map((u) => ({ id: u, email: `${u}@x.com`, displayName: u })) });
  await prisma.playerProfile.create({ data: { userId: "orgA", firstName: "Org", lastName: "Owner", country: "Pakistan" } });

  // ---- paged user search ----
  const p1 = await searchUsersPage({ q: "", cursor: null, limit: 10 });
  ok("first page has 10 and a cursor", p1.items.length === 10 && p1.nextCursor !== null);
  const p2 = await searchUsersPage({ q: "", cursor: p1.nextCursor, limit: 10 });
  const p3 = await searchUsersPage({ q: "", cursor: p2.nextCursor, limit: 10 });
  const p4 = await searchUsersPage({ q: "", cursor: p3.nextCursor, limit: 10 });
  const all = [...p1.items, ...p2.items, ...p3.items, ...p4.items].map((u) => u.id);
  ok("pages never repeat a person", new Set(all).size === all.length);
  ok("pages together cover everyone (31), last page has no cursor", all.length === 31 && p4.items.length === 1 && p4.nextCursor === null);
  const f = await searchUsersPage({ q: "person 1", cursor: null, limit: 10 });
  ok("search narrows (Person 1, 10-19)", f.items.length === 10 && f.items.every((u) => u.name.startsWith("Person 1")));
  ok("search by email", (await searchUsersPage({ q: "orgA@x", cursor: null, limit: 10 })).items[0]?.id === "orgA");

  // ---- add an organization ----
  const base = { adminId: "adm", type: "organization" as const };
  ok("name too short is refused", err(await adminCreateOrganization({ ...base, userId: "orgA", orgName: "x" })) === "validation_error");
  const a = await adminCreateOrganization({ ...base, userId: "orgA", orgName: "Falcon Esports", country: "Pakistan", city: "Lahore", contactEmail: "f@x.com", liftLimits: true });
  ok("organization without KYC is created", "data" in a);
  const orgA = await prisma.organizerProfile.findUnique({ where: { userId: "orgA" }, include: { identity: true, institution: true } });
  ok("details and admin marker saved", orgA?.city === "Lahore" && orgA.contactEmail === "f@x.com" && orgA.createdByAdminId === "adm");
  ok("starter limits lifted, no identity, not an institute", orgA?.limitsLifted === true && orgA.identity === null && orgA.institution === null);
  ok("account marked approved", (await prisma.user.findUnique({ where: { id: "orgA" } }))?.kycStatus === "approved");
  ok("same account again is refused", err(await adminCreateOrganization({ ...base, userId: "orgA", orgName: "Other Name" })) === "already_organizer");
  ok("taken name is refused", err(await adminCreateOrganization({ ...base, userId: "inst1", orgName: "falcon  esports!" })) === "name_taken");

  // ---- institute: the stricter checks ----
  const i0 = { adminId: "adm", type: "institute" as const, userId: "inst1", orgName: "Lahore Grammar University", registrationNumber: "HEC-123", address: "Main Boulevard, Lahore" };
  ok("institute needs a kind", err(await adminCreateOrganization({ ...i0, institute: inst("inst1", { kind: "" }), kyc: kyc("inst1") })) === "validation_error");
  ok("institute needs the registration document", err(await adminCreateOrganization({ ...i0, institute: inst("inst1", { proofPath: null }), kyc: kyc("inst1") })) === "validation_error");
  ok("institute needs the identity check", err(await adminCreateOrganization({ ...i0, institute: inst("inst1"), kyc: null })) === "validation_error");
  ok("institute needs a registration number", err(await adminCreateOrganization({ ...i0, registrationNumber: "", institute: inst("inst1"), kyc: kyc("inst1") })) === "validation_error");
  ok("a photo from someone else's folder is refused", err(await adminCreateOrganization({ ...i0, institute: inst("inst1", { proofPath: "orgA/proof.jpg" }), kyc: kyc("inst1") })) === "validation_error");
  ok("KYC must be ticked as checked", err(await adminCreateOrganization({ ...i0, institute: inst("inst1"), kyc: kyc("inst1", { checked: false }) })) === "validation_error");
  const i1 = await adminCreateOrganization({ ...i0, institute: inst("inst1"), kyc: kyc("inst1") });
  ok("institute with KYC and proof is created", "data" in i1);
  const row = await prisma.organizerProfile.findUnique({ where: { userId: "inst1" }, include: { identity: true, institution: true } });
  ok("institute row: kind, proof, verified by the admin", row?.institution?.kind === "university" && row.institution.proofPath === "inst1/proof.jpg" && row.institution.verified && row.institution.verifiedById === "adm");
  ok("identity saved as approved, reviewed by the admin", row?.identity?.status === "approved" && row.identity.reviewedById === "adm" && row.identity.over18Confirmed && row.identity.validUntil !== null && row.identity.purgeAfter !== null);
  ok("document number is encrypted, not plain", Boolean(row?.identity?.detailsEnc) && !row!.identity!.detailsEnc!.includes("3520212345671") && row!.identity!.documentNumber === null);
  ok("institute proof is protected from the upload sweep", (await referencedIdentityPaths()).has("inst1/proof.jpg"));
  ok("institute name taken (any case)", err(await adminCreateOrganization({ ...i0, userId: "inst2", orgName: "lahore grammar university", institute: inst("inst2"), kyc: kyc("inst2", { documentNumber: "99999-9999999-9" }) })) === "name_taken");
  ok("proof view is logged", "data" in (await requestInstituteProofView(row!.institution!.id, "adm")) && (await prisma.adminActionLog.count({ where: { action: "institute_proof_viewed" } })) === 1);

  // ---- same ID number as a banned organizer ----
  await prisma.accountBan.create({ data: { userId: "inst1", reason: "scam", createdById: "adm" } });
  ok("ID number of a banned organizer is refused", err(await adminCreateOrganization({ ...base, userId: "bad", orgName: "Come Back Inc", kyc: kyc("bad") })) === "duplicate_banned_id");
  await prisma.accountBan.create({ data: { userId: "dup", reason: "x", createdById: "adm" } });
  ok("banned owner is refused", err(await adminCreateOrganization({ ...base, userId: "dup", orgName: "Dup Org" })) === "banned");

  // ---- paid plan + the list ----
  const orgId = (a as { data: { organizerId: string } }).data.organizerId;
  const assigned = await adminAssignOrganizerPlan({ adminId: "adm", organizerId: orgId, planCode: "organizer_pro", duration: { kind: "months", months: 3 } });
  ok("paid plan assigned", "data" in assigned);
  const list = await listOrganizationsPage({ q: "", cursor: null, limit: 10 });
  ok("list shows both, newest first", list.items.length === 2 && list.nextCursor === null);
  const falcon = list.items.find((o) => o.name === "Falcon Esports")!;
  ok("plan start and end present for a paid plan", falcon.planState === "active" && falcon.planStartedAt !== null && falcon.planEndsAt !== null && falcon.type === "organization");
  ok("institute row is typed and verified", list.items.find((o) => o.type === "institute")?.instituteVerified === true);
  ok("type filter: institutes", (await listOrganizationsPage({ q: "", cursor: null, limit: 10, type: "institute" })).items.length === 1);
  ok("type filter: organizations", (await listOrganizationsPage({ q: "", cursor: null, limit: 10, type: "organization" })).items.length === 1);
  ok("search by owner email", (await listOrganizationsPage({ q: "inst1@x", cursor: null, limit: 10 })).items[0]?.name === "Lahore Grammar University");
  const half = await listOrganizationsPage({ q: "", cursor: null, limit: 1 });
  const rest = await listOrganizationsPage({ q: "", cursor: half.nextCursor, limit: 1 });
  ok("list pages by cursor", half.items.length === 1 && rest.items.length === 1 && half.items[0].id !== rest.items[0].id && rest.nextCursor === null);

  // ---- detail page queries (includes the raw SQL) ----
  const d = await getOrganizationDetail(orgId);
  ok("detail loads", d !== null && d.name === "Falcon Esports" && d.plan.state === "active" && d.growth.length === 6);
  ok("detail: added-by and plan history", d?.addedByAdmin === "Admin" && d.plan.history.length >= 1);
  const di = await getOrganizationDetail(row!.id);
  ok("detail: institute and identity", di?.type === "institute" && di.institute?.hasProof === true && di.identity?.state === "approved" && di.owner.ban !== null);
  ok("detail: unknown id", (await getOrganizationDetail("nope")) === null);

  // ---- tournaments, money, complaints feed the detail numbers ----
  const game = await prisma.game.create({ data: { name: "Test Game" } });
  const t = await prisma.tournament.create({
    data: { slug: "t1", organizerId: orgId, gameId: game.id, name: "Cup", type: "tournament", mode: "solo", maxTeams: 8, format: "single_elimination", entryType: "paid", entryFeeAmount: 500, entryFeeCurrency: "PKR", prizePoolAmount: 3000, prizePoolCurrency: "PKR", status: "completed" },
  });
  const [pa, pb] = await Promise.all(["p01", "p02"].map((u) => prisma.playerProfile.create({ data: { userId: u } })));
  await prisma.registration.create({ data: { tournamentId: t.id, playerId: pa.id, status: "approved", paymentStatus: "paid" } });
  await prisma.registration.create({ data: { tournamentId: t.id, playerId: pb.id, status: "pending", paymentStatus: "unpaid" } });
  await prisma.organizerReport.create({ data: { organizerId: orgId, tournamentId: t.id, reporterUserId: "p01", kind: "not_delivered", description: "Never started" } });
  const d2 = await getOrganizationDetail(orgId);
  ok("detail: entry fees = fee x PAID registrations only", d2?.money.earned.PKR === 500);
  ok("detail: players, registrations, tournaments", d2?.players.unique === 2 && d2.players.registrations === 2 && d2.tournaments.total === 1 && d2.tournaments.paid === 1);
  ok("detail: prize pool announced", d2?.money.prizePool.PKR === 3000);
  ok("detail: complaint listed with reporter name", d2?.complaints.total === 1 && d2.complaints.open === 1 && d2.complaints.recent[0]?.reporter === "Person 1");
  ok("detail: this month shows in growth", d2?.growth[5].tournaments === 1 && d2.growth[5].registrations === 2);

  const lu = await listUsersPage({ q: "", cursor: null, limit: 10 });
  ok("users list pages", lu.items.length === 10 && lu.nextCursor !== null && lu.items.every((u) => typeof u.joinedAt === "string"));
  ok("users list shows the organization", (await listUsersPage({ q: "orgA@x", cursor: null, limit: 10 })).items[0]?.organization?.name === "Falcon Esports");
  ok("clubs list runs", (await listClubsPage({ q: "", cursor: null, limit: 10 })).items.length === 0);

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
