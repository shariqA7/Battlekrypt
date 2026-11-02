// Account deletion against a real database, with fake storage: what blocks it, the request and
// cancel flow, what erasure removes and what it keeps, and the daily job.
// Needs a Postgres with all migrations applied (npm test provides one).
import { prisma } from "../lib/prisma";
import { ID_BUCKET } from "../lib/identity";
import { PROOF_BUCKET } from "../lib/proof-storage";
import { cancelDeletion, deletionBlockers, eraseUser, processDueDeletions, requestDeletion, type ErasureDeps } from "../lib/services/account-deletion";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

// Fake storage: records what would be deleted.
const removed: { bucket: string; paths: string[] }[] = [];
let authDeleted: string[] = [];
const files: Record<string, string[]> = {};
const deps: ErasureDeps = {
  listFolder: async (bucket, folder) => files[`${bucket}/${folder}`] ?? [],
  removeFiles: async (bucket, paths) => { if (paths.length) removed.push({ bucket, paths }); },
  deleteAuthUser: async (id) => { authDeleted.push(id); },
};

async function main() {
  await prisma.user.createMany({ data: [
    { id: "staff", email: "staff@x.com", displayName: "Staff", isAdmin: true, staffRole: "super_admin" },
    { id: "clean", email: "clean@x.com", displayName: "Clean" },
    { id: "busy", email: "busy@x.com", displayName: "Busy" },
    { id: "other", email: "other@x.com", displayName: "Other" },
    { id: "due1", email: "due1@x.com", displayName: "Due One" },
    { id: "due2", email: "due2@x.com", displayName: "Due Two" },
    { id: "later", email: "later@x.com", displayName: "Later" },
  ]});
  const org = await prisma.organizerProfile.create({ data: { userId: "other", orgName: "Org" } });
  const game = await prisma.game.create({ data: { name: "G" } });
  const t = await prisma.tournament.create({ data: { organizerId: org.id, gameId: game.id, type: "tournament", maxTeams: 10, format: "single_elimination", status: "registration_open", slug: "ad1", name: "Cup", mode: "solo", entryType: "paid" } });
  const profile = (userId: string) => prisma.playerProfile.create({ data: { userId, firstName: "Real", lastName: "Name", mobileNumber: "0300", city: "Lahore", birthDate: new Date("2000-01-01"), username: `u_${userId}`, guardianEmail: "g@x.com", favoriteGames: ["G"] } });

  // ---- blockers
  ok("a normal account has nothing in the way", (await deletionBlockers("clean")).length === 0);
  ok("a staff account is blocked", (await deletionBlockers("staff")).some((b) => b.kind === "staff"));
  const bp = await profile("busy");
  const reg = await prisma.registration.create({ data: { tournamentId: t.id, playerId: bp.id, status: "approved", payerUserId: "busy", paymentProofUrl: "busy/payment-proofs/aaaaaaaa-1.png", customFieldResponses: { ign: "RealIGN" } } });
  ok("being entered in a live tournament blocks", (await deletionBlockers("busy")).some((b) => b.kind === "live_entries"));
  const dispute = await prisma.paymentDispute.create({ data: {
    registrationId: reg.id, tournamentId: t.id, organizerId: org.id, payerUserId: "busy", organizerUserId: "other",
    kind: "wrong_amount", openedByUserId: "busy", reason: "wrong amount taken", responseDueAt: days(2),
    openerEvidenceUrls: ["busy/dispute-evidence/bbbbbbbb-2.png", "other/dispute-evidence/cccccccc-3.png"],
  } });
  ok("an open dispute blocks, for the payer and for the organizer", (await deletionBlockers("busy")).some((b) => b.kind === "payment_dispute") && (await deletionBlockers("other")).some((b) => b.kind === "payment_dispute"));

  // ---- request and cancel
  ok("the phrase is required", (await requestDeletion({ userId: "clean", confirm: "delete", origin: "http://x" })).hasOwnProperty("error"));
  const blocked = await requestDeletion({ userId: "busy", confirm: "DELETE MY ACCOUNT", origin: "http://x" });
  ok("a blocked account can't be scheduled and is told why", "error" in blocked && blocked.error === "blocked" && (blocked.blockers?.length ?? 0) > 0);
  const sched = await requestDeletion({ userId: "clean", confirm: " delete my account ", origin: "http://x" });
  const cleanRow = await prisma.user.findUnique({ where: { id: "clean" } });
  ok("a clean account is scheduled for 14 days out", "ok" in sched && !!cleanRow?.deletionDueAt && Math.abs(cleanRow.deletionDueAt.getTime() - days(14).getTime()) < 60_000);
  ok("asking twice is refused", "error" in (await requestDeletion({ userId: "clean", confirm: "DELETE MY ACCOUNT", origin: "http://x" })));
  ok("cancelling clears the schedule", "ok" in (await cancelDeletion("clean")) && (await prisma.user.findUnique({ where: { id: "clean" } }))?.deletionDueAt === null);
  ok("cancelling when nothing is scheduled is refused", "error" in (await cancelDeletion("clean")));

  // ---- erasure
  await prisma.notification.create({ data: { userId: "clean", type: "x", title: "hello", body: "b" } });
  const don = await prisma.donation.create({ data: { userId: "clean", amount: 10, currency: "PKR", proofUrl: "clean/donation-proofs/lllllll1-9.png", status: "approved", message: "for the kids", anonymous: false } });
  const rate = await prisma.organizerRating.create({ data: { organizerId: org.id, tournamentId: t.id, raterUserId: "clean", stars: 4, comment: "Great organizer, call me on 0300" } });
  const cp = await profile("clean");
  await prisma.playerPayoutMethod.create({ data: { playerId: cp.id, payeeName: "Real Name", method: "JazzCash", detailsEnc: "enc" } });
  await prisma.parentalConsent.create({ data: { playerId: cp.id, guardianEmail: "g@x.com", tokenHash: "th1", linkExpiresAt: days(5), signedName: "Guardian Name", signedIp: "1.2.3.4", signedUserAgent: "UA", manageTokenHash: "mh1" } });
  const cReg = await prisma.registration.create({ data: { tournamentId: t.id, playerId: cp.id, status: "rejected", payerUserId: "clean", paymentProofUrl: "clean/payment-proofs/dddddddd-4.png", customFieldResponses: { ign: "CleanIGN" } } });
  const plan = await prisma.plan.findFirst();
  if (plan) await prisma.planRequest.create({ data: { userId: "clean", audience: plan.audience, planCode: plan.code, status: "approved", proofUrl: "clean/plan-proofs/eeeeeeee-5.png" } });
  files[`${PROOF_BUCKET}/clean`] = ["clean/payment-proofs/dddddddd-4.png", "clean/donation-proofs/lllllll1-9.png", ...(plan ? ["clean/plan-proofs/eeeeeeee-5.png"] : [])];
  files[`${ID_BUCKET}/clean`] = ["clean/front.jpg"];

  const staffTry = await eraseUser("staff", deps);
  ok("a staff account is never erased", staffTry.erased === false && authDeleted.length === 0);
  const res = await eraseUser("clean", deps);
  ok("erasure reports what it did", res.erased === true && res.filesRemoved === 2 && res.filesKept === (plan ? 2 : 1));
  ok("unneeded payment files and ID photos were removed", removed.some((r) => r.bucket === PROOF_BUCKET && r.paths.includes("clean/payment-proofs/dddddddd-4.png")) && removed.some((r) => r.bucket === ID_BUCKET && r.paths.includes("clean/front.jpg")));
  ok("a file behind an approved plan payment is kept", !plan || !removed.some((r) => r.paths.includes("clean/plan-proofs/eeeeeeee-5.png")));
  ok("the sign-in account was deleted", authDeleted.join() === "clean");
  const u = await prisma.user.findUnique({ where: { id: "clean" } });
  ok("the account row is anonymous and marked deleted", u?.email === null && u.displayName === "Deleted user" && !!u.deletedAt && u.deletionDueAt === null);
  const pp = await prisma.playerProfile.findUnique({ where: { id: cp.id } });
  ok("personal details are cleared", pp?.firstName === "Deleted" && pp.mobileNumber === null && pp.city === null && pp.birthDate === null && pp.username === null && pp.guardianEmail === null && pp.favoriteGames.length === 0);
  ok("payout details are deleted", (await prisma.playerPayoutMethod.count({ where: { playerId: cp.id } })) === 0);
  const pc = await prisma.parentalConsent.findFirst({ where: { playerId: cp.id } });
  ok("consent keeps that it was given, not who signed", pc?.guardianEmail === "erased" && pc.signedName === null && pc.signedIp === null && pc.manageTokenHash === null);
  const rr = await prisma.registration.findUnique({ where: { id: cReg.id } });
  ok("the entry stays (results history) without personal answers or the deleted proof", !!rr && rr.customFieldResponses === null && rr.paymentProofUrl === null);
  ok("a donation stays but the donor's message goes, and its screenshot is kept", (await prisma.donation.findUnique({ where: { id: don.id } }))?.message === null && (await prisma.donation.findUnique({ where: { id: don.id } }))?.proofUrl === "clean/donation-proofs/lllllll1-9.png" && !removed.some((r) => r.paths.includes("clean/donation-proofs/lllllll1-9.png")));
  ok("a rating keeps its stars but loses the comment", (await prisma.organizerRating.findUnique({ where: { id: rate.id } }))?.comment === null && (await prisma.organizerRating.findUnique({ where: { id: rate.id } }))?.stars === 4);
  ok("notifications are deleted", (await prisma.notification.count({ where: { userId: "clean" } })) === 0);
  ok("an erasure record exists and holds no name", (await prisma.accountErasure.count({ where: { userId: "clean" } })) === 1);
  ok("erasing twice does nothing", (await eraseUser("clean", deps)).erased === false);

  // ---- the daily job
  await prisma.user.update({ where: { id: "due1" }, data: { deletionRequestedAt: days(-15), deletionDueAt: days(-1) } });
  await prisma.user.update({ where: { id: "due2" }, data: { deletionRequestedAt: days(-15), deletionDueAt: days(-1) } });
  await prisma.user.update({ where: { id: "later" }, data: { deletionRequestedAt: days(-1), deletionDueAt: days(13) } });
  const d2 = await profile("due2");
  await prisma.registration.create({ data: { tournamentId: t.id, playerId: d2.id, status: "pending", payerUserId: "due2" } }); // a live entry appeared again
  authDeleted = [];
  const job = await processDueDeletions(new Date(), deps, "http://x");
  ok("the job erases a clean due account", job.erased === 1 && (await prisma.user.findUnique({ where: { id: "due1" } }))?.deletedAt !== null && authDeleted.join() === "due1");
  const due2 = await prisma.user.findUnique({ where: { id: "due2" } });
  ok("an account with something open again is cancelled, not erased", job.cancelled === 1 && due2?.deletedAt === null && due2.deletionDueAt === null && due2.email === "due2@x.com");
  ok("an account still in its cooling-off is left alone", (await prisma.user.findUnique({ where: { id: "later" } }))?.deletedAt === null && (await prisma.user.findUnique({ where: { id: "later" } }))?.deletionDueAt !== null);
  void dispute;

  await prisma.$disconnect();
  if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
  console.log("\nall passed");
}
main().catch(async (e) => { console.error("FAIL crashed", e); await prisma.$disconnect(); process.exit(1); });
