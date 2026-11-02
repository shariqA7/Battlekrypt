// The daily retention job against a real database, with fake storage: old things go, recent or
// still-needed things stay, and a file is only cleared from the database once it was removed.
// (Student ID photos, challenge files and financial files are covered by the rule tests and by
// the same pattern; they need richer seed data than this test builds.)
import { prisma } from "../lib/prisma";
import { PROOF_BUCKET } from "../lib/proof-storage";
import { runRetention, type RetentionDeps } from "../lib/services/retention";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const now = new Date("2026-11-10T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
const removed: { bucket: string; paths: string[] }[] = [];
let failRemoval = false;
const deps: RetentionDeps = { removeFiles: async (bucket, paths) => { if (failRemoval) throw new Error("storage down"); removed.push({ bucket, paths }); } };
const wasRemoved = (path: string) => removed.some((r) => r.paths.includes(path));

async function main() {
  await prisma.user.createMany({ data: [{ id: "u1", email: "u1@x.com", displayName: "U1" }, { id: "org", email: "org@x.com", displayName: "Org" }] });
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "Org" } });
  const game = await prisma.game.create({ data: { name: "G" } });
  const mk = (slug: string, status: "completed" | "cancelled" | "in_progress", completedAt: Date | null, updatedAt?: Date) =>
    prisma.tournament.create({ data: { organizerId: org.id, gameId: game.id, type: "tournament", maxTeams: 10, format: "single_elimination", status, slug, name: slug, mode: "solo", entryType: "paid", completedAt, ...(updatedAt ? { updatedAt } : {}) } });
  const tOld = await mk("old", "completed", ago(400));
  const tRecent = await mk("recent", "completed", ago(30));
  const tLive = await mk("live", "in_progress", null);
  const reg = (tournamentId: string, path: string) => prisma.registration.create({ data: { tournamentId, paymentProofUrl: path, payerUserId: "u1" } });
  const rOld = await reg(tOld.id, "u1/payment-proofs/aaaaaaaa-1.png");
  const rRecent = await reg(tRecent.id, "u1/payment-proofs/bbbbbbbb-2.png");
  const rLive = await reg(tLive.id, "u1/payment-proofs/cccccccc-3.png");
  const rDisputed = await reg(tOld.id, "u1/payment-proofs/dddddddd-4.png");
  await prisma.paymentDispute.create({ data: { registrationId: rDisputed.id, tournamentId: tOld.id, organizerId: org.id, payerUserId: "u1", organizerUserId: "org", kind: "wrong_amount", openedByUserId: "u1", reason: "wrong amount taken", responseDueAt: ago(-2) } });
  const rDone = await reg(tOld.id, "u1/payment-proofs/eeeeeeee-5.png");
  await prisma.paymentDispute.create({ data: {
    registrationId: rDone.id, tournamentId: tOld.id, organizerId: org.id, payerUserId: "u1", organizerUserId: "org", kind: "wrong_amount", openedByUserId: "u1", reason: "wrong amount taken",
    responseDueAt: ago(500), status: "resolved", outcome: "for_organizer", resolvedAt: ago(400), openerEvidenceUrls: ["u1/dispute-evidence/ffffffff-6.png"],
  } });
  const owed = await reg(tOld.id, "u1/payment-proofs/gggggggg-7.png");
  await prisma.paymentDispute.create({ data: {
    registrationId: owed.id, tournamentId: tOld.id, organizerId: org.id, payerUserId: "u1", organizerUserId: "org", kind: "wrong_amount", openedByUserId: "u1", reason: "wrong amount taken",
    responseDueAt: ago(500), status: "resolved", outcome: "for_payer", resolvedAt: ago(400), refundDueAt: ago(390), openerEvidenceUrls: ["u1/dispute-evidence/hhhhhhhh-8.png"],
  } });

  await prisma.notification.createMany({ data: [
    { userId: "u1", type: "x", title: "read old", readAt: ago(100), createdAt: ago(120) },
    { userId: "u1", type: "x", title: "read new", readAt: ago(10), createdAt: ago(20) },
    { userId: "u1", type: "x", title: "unread old", createdAt: ago(400) },
    { userId: "u1", type: "x", title: "unread new", createdAt: ago(40) },
  ] });
  await prisma.proofFingerprint.createMany({ data: [
    { kind: "registration", refId: "old-fp", sha256: "a", createdAt: ago(800) },
    { kind: "registration", refId: "new-fp", sha256: "b", createdAt: ago(100) },
  ] });
  const cp = await prisma.playerProfile.create({ data: { userId: "u1", firstName: "P", lastName: "x", birthDate: new Date("2012-01-01") } });
  await prisma.parentalConsent.createMany({ data: [
    { playerId: cp.id, guardianEmail: "old-pending@x.com", tokenHash: "t1", linkExpiresAt: ago(200), status: "pending" },
    { playerId: cp.id, guardianEmail: "fresh-pending@x.com", tokenHash: "t2", linkExpiresAt: ago(30), status: "pending" },
    { playerId: cp.id, guardianEmail: "ended@x.com", tokenHash: "t3", linkExpiresAt: ago(2000), status: "approved", decidedAt: ago(1500), validUntil: ago(1300), signedName: "Guardian", signedIp: "1.1.1.1" },
    { playerId: cp.id, guardianEmail: "in-force@x.com", tokenHash: "t4", linkExpiresAt: ago(100), status: "approved", decidedAt: ago(90), validUntil: ago(-200), signedName: "Guardian2", signedIp: "2.2.2.2" },
  ] });

  // ---- a failing storage leaves the database alone
  failRemoval = true;
  const failed = await runRetention(now, deps);
  ok("when storage is down the file rules report failure and change nothing", failed.entryPaymentProofs === "failed" && (await prisma.registration.findUnique({ where: { id: rOld.id } }))?.paymentProofUrl === "u1/payment-proofs/aaaaaaaa-1.png");
  ok("...while rules with no files still ran", typeof failed.notifications === "number" && failed.notifications > 0);
  failRemoval = false;

  const res = await runRetention(now, deps);
  ok("no rule failed on the real run", Object.values(res).every((v) => v !== "failed"));

  const n = (await prisma.notification.findMany({ select: { title: true } })).map((x: { title: string }) => x.title).sort();
  ok("old read and very old unread notifications go, recent ones stay", n.join() === "read new,unread new");
  ok("old fingerprints go, recent ones stay", (await prisma.proofFingerprint.count({ where: { refId: "old-fp" } })) === 0 && (await prisma.proofFingerprint.count({ where: { refId: "new-fp" } })) === 1);

  const proof = async (id: string) => (await prisma.registration.findUnique({ where: { id } }))?.paymentProofUrl;
  ok("a proof from an event closed over a year ago is removed (file and link)", wasRemoved("u1/payment-proofs/aaaaaaaa-1.png") && (await proof(rOld.id)) === null && removed.some((r) => r.bucket === PROOF_BUCKET));
  ok("a proof from a recent event stays", !wasRemoved("u1/payment-proofs/bbbbbbbb-2.png") && (await proof(rRecent.id)) === "u1/payment-proofs/bbbbbbbb-2.png");
  ok("a proof from a live event stays", !wasRemoved("u1/payment-proofs/cccccccc-3.png") && (await proof(rLive.id)) !== null);
  ok("a proof with an open dispute stays", !wasRemoved("u1/payment-proofs/dddddddd-4.png") && (await proof(rDisputed.id)) !== null);
  ok("evidence on a long-resolved dispute is removed", wasRemoved("u1/dispute-evidence/ffffffff-6.png") && (await prisma.paymentDispute.findFirst({ where: { registrationId: rDone.id } }))?.openerEvidenceUrls.length === 0);
  ok("evidence is kept while a refund is still owed", !wasRemoved("u1/dispute-evidence/hhhhhhhh-8.png") && ((await prisma.paymentDispute.findFirst({ where: { registrationId: owed.id } }))?.openerEvidenceUrls.length ?? 0) === 1);

  const consent = async (t: string) => prisma.parentalConsent.findFirst({ where: { tokenHash: t } });
  ok("an unanswered guardian request is scrubbed, a fresh one is not", (await consent("t1"))?.guardianEmail === "erased" && (await consent("t2"))?.guardianEmail === "fresh-pending@x.com");
  const ended = await consent("t3");
  ok("a consent record that ended over 3 years ago loses who signed, but stays", ended?.guardianEmail === "erased" && ended.signedName === null && ended.signedIp === null && ended.status === "approved" && !!ended.decidedAt);
  ok("a consent record still in force is untouched", (await consent("t4"))?.guardianEmail === "in-force@x.com" && (await consent("t4"))?.signedName === "Guardian2");

  const again = await runRetention(now, deps);
  ok("running again finds nothing more to do", Object.values(again).every((v) => v === 0));

  await prisma.$disconnect();
  if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
  console.log("\nall passed");
}
main().catch(async (e) => { console.error("FAIL crashed", e); await prisma.$disconnect(); process.exit(1); });
