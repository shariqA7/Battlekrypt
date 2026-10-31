// One-time move of OLD payment proofs from the public bucket into the private "payment-proofs"
// bucket, so nobody can open them just by having a link.
//
//   npx tsx scripts/migrate-proofs-to-private.ts --dry-run       shows what would move, changes nothing
//   npx tsx scripts/migrate-proofs-to-private.ts --delete-old    moves them AND deletes the public copy
//
// Covers payment proofs (entries, plan payments, club fees, invoices), payment-dispute evidence,
// challenge screenshots / receipts / dispute evidence, and ledger expense receipts.
//
// Reads .env.local (DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Safe to run
// again: only proofs that are still public links are touched. Per proof it copies the file,
// updates the database, and only then (with --delete-old) deletes the public copy, so a failure
// leaves the old link working. Run the SQL in SETUP.md ("Private payment proofs") first.
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";

dotenv.config({ path: ".env.local" });

async function main() {
  const dry = process.argv.includes("--dry-run");
  const deleteOld = process.argv.includes("--delete-old");
  const { prisma } = await import("../lib/prisma");
  const { createServiceClient } = await import("../lib/supabase/admin");
  const { PROOF_BUCKET, PUBLIC_BUCKET, publicUrlToPath } = await import("../lib/proof-storage");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  const sb = createServiceClient();
  const prefix = `${supabaseUrl}/storage/v1/object/public/${PUBLIC_BUCKET}/`;
  const counts = { moved: 0, skippedNoOwner: 0, failed: 0 };

  /** Copy one old public proof into the private bucket. Returns the new path, or null. */
  async function copy(value: string, ownerId: string | null | undefined, folder: string): Promise<{ path: string; old: string } | null> {
    const old = publicUrlToPath(value, supabaseUrl, PUBLIC_BUCKET);
    if (!old) return null;
    if (!ownerId) { counts.skippedNoOwner++; console.warn(`  skipped (no owner found): ${old}`); return null; }
    const ext = (old.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    const path = `${ownerId}/${folder}/${randomUUID()}.${ext}`;
    if (dry) { counts.moved++; console.log(`  would move ${old} -> ${path}`); return { path, old }; }
    const { data, error } = await sb.storage.from(PUBLIC_BUCKET).download(old);
    if (error || !data) { counts.failed++; console.warn(`  could not read ${old}: ${error?.message}`); return null; }
    const up = await sb.storage.from(PROOF_BUCKET).upload(path, data, { contentType: data.type || undefined });
    if (up.error) { counts.failed++; console.warn(`  could not copy ${old}: ${up.error.message}`); return null; }
    counts.moved++;
    return { path, old };
  }
  const finish = async (old: string) => {
    if (!dry && deleteOld) {
      const rm = await sb.storage.from(PUBLIC_BUCKET).remove([old]);
      if (rm.error) console.warn(`  moved, but could not delete the public copy ${old}: ${rm.error.message}`);
    }
  };

  console.log(dry ? "DRY RUN: nothing will change.\n" : deleteOld ? "Moving proofs and deleting the public copies.\n" : "Moving proofs (public copies are kept).\n");

  console.log("Registrations");
  for (const r of await prisma.registration.findMany({
    where: { paymentProofUrl: { startsWith: prefix } },
    select: { id: true, paymentProofUrl: true, payerUserId: true, player: { select: { userId: true } }, teamEntry: { select: { members: { select: { player: { select: { userId: true } } } } } } },
  })) {
    const owner = r.payerUserId ?? r.player?.userId ?? r.teamEntry?.members[0]?.player.userId;
    const c = await copy(r.paymentProofUrl!, owner, "payment-proofs");
    if (c && !dry) { await prisma.registration.update({ where: { id: r.id }, data: { paymentProofUrl: c.path } }); await finish(c.old); }
  }

  console.log("Plan requests");
  for (const r of await prisma.planRequest.findMany({ where: { proofUrl: { startsWith: prefix } }, select: { id: true, proofUrl: true, userId: true } })) {
    const c = await copy(r.proofUrl, r.userId, "plan-proofs");
    if (c && !dry) { await prisma.planRequest.update({ where: { id: r.id }, data: { proofUrl: c.path } }); await finish(c.old); }
  }

  console.log("Club fee proofs");
  for (const r of await prisma.clubProfile.findMany({ where: { feeProofUrl: { startsWith: prefix } }, select: { id: true, feeProofUrl: true, userId: true } })) {
    const c = await copy(r.feeProofUrl!, r.userId, "club-fee-proofs");
    if (c && !dry) { await prisma.clubProfile.update({ where: { id: r.id }, data: { feeProofUrl: c.path } }); await finish(c.old); }
  }

  console.log("Invoices");
  for (const r of await prisma.invoice.findMany({ where: { proofUrl: { startsWith: prefix } }, select: { id: true, proofUrl: true, userId: true } })) {
    const c = await copy(r.proofUrl!, r.userId, "invoice-proofs");
    if (c && !dry) { await prisma.invoice.update({ where: { id: r.id }, data: { proofUrl: c.path } }); await finish(c.old); }
  }

  console.log("Payment dispute evidence");
  for (const d of await prisma.paymentDispute.findMany({ select: { id: true, payerUserId: true, organizerUserId: true, openedByUserId: true, openerEvidenceUrls: true, responderEvidenceUrls: true } })) {
    const responder = d.openedByUserId === d.payerUserId ? d.organizerUserId : d.payerUserId;
    const sides = [
      { key: "openerEvidenceUrls" as const, urls: d.openerEvidenceUrls, owner: d.openedByUserId },
      { key: "responderEvidenceUrls" as const, urls: d.responderEvidenceUrls, owner: responder },
    ];
    for (const s of sides) {
      if (!s.urls.some((u: string) => u.startsWith(prefix))) continue;
      const next: string[] = [];
      const olds: string[] = [];
      for (const u of s.urls) {
        const c = u.startsWith(prefix) ? await copy(u, s.owner, "dispute-evidence") : null;
        next.push(c?.path ?? u);
        if (c) olds.push(c.old);
      }
      if (!dry) { await prisma.paymentDispute.update({ where: { id: d.id }, data: { [s.key]: next } }); for (const o of olds) await finish(o); }
    }
  }

  /** Move every old public link in a list of files; returns the new list (and the public copies to delete). */
  async function moveList(urls: string[], owner: string | null | undefined, folder: string) {
    const next: string[] = [];
    const olds: string[] = [];
    for (const u of urls) {
      const c = u.startsWith(prefix) ? await copy(u, owner, folder) : null;
      next.push(c?.path ?? u);
      if (c) olds.push(c.old);
    }
    return { next, olds, changed: olds.length > 0 };
  }

  console.log("Challenge proofs and receipts");
  for (const a of await prisma.challengeApplication.findMany({
    select: { id: true, applicantUserId: true, proofUrls: true, paymentReceiptUrls: true, challenge: { select: { posterUserId: true } } },
  })) {
    const proofs = a.proofUrls.some((u: string) => u.startsWith(prefix)) ? await moveList(a.proofUrls, a.applicantUserId, "challenge-proofs") : null;
    const receipts = a.paymentReceiptUrls.some((u: string) => u.startsWith(prefix)) ? await moveList(a.paymentReceiptUrls, a.challenge.posterUserId, "challenge-receipts") : null;
    if (dry || (!proofs?.changed && !receipts?.changed)) continue;
    await prisma.challengeApplication.update({ where: { id: a.id }, data: { ...(proofs?.changed ? { proofUrls: proofs.next } : {}), ...(receipts?.changed ? { paymentReceiptUrls: receipts.next } : {}) } });
    for (const o of [...(proofs?.olds ?? []), ...(receipts?.olds ?? [])]) await finish(o);
  }

  console.log("Challenge dispute evidence");
  for (const d of await prisma.challengeDispute.findMany({
    select: { id: true, openedById: true, openerEvidenceUrls: true, responderEvidenceUrls: true, application: { select: { applicantUserId: true, challenge: { select: { posterUserId: true } } } } },
  })) {
    const other = d.openedById === d.application.challenge.posterUserId ? d.application.applicantUserId : d.application.challenge.posterUserId;
    const opener = d.openerEvidenceUrls.some((u: string) => u.startsWith(prefix)) ? await moveList(d.openerEvidenceUrls, d.openedById, "challenge-disputes") : null;
    const responder = d.responderEvidenceUrls.some((u: string) => u.startsWith(prefix)) ? await moveList(d.responderEvidenceUrls, other, "challenge-disputes") : null;
    if (dry || (!opener?.changed && !responder?.changed)) continue;
    await prisma.challengeDispute.update({ where: { id: d.id }, data: { ...(opener?.changed ? { openerEvidenceUrls: opener.next } : {}), ...(responder?.changed ? { responderEvidenceUrls: responder.next } : {}) } });
    for (const o of [...(opener?.olds ?? []), ...(responder?.olds ?? [])]) await finish(o);
  }

  console.log("Ledger expense receipts");
  for (const x of await prisma.expense.findMany({ where: { receiptUrl: { startsWith: prefix } }, select: { id: true, receiptUrl: true, createdById: true } })) {
    const c = await copy(x.receiptUrl!, x.createdById ?? "migrated", "expense-receipts");
    if (c && !dry) { await prisma.expense.update({ where: { id: x.id }, data: { receiptUrl: c.path } }); await finish(c.old); }
  }

  console.log(`\n${dry ? "Would move" : "Moved"}: ${counts.moved}. Skipped (no owner): ${counts.skippedNoOwner}. Failed: ${counts.failed}.`);
  await prisma.$disconnect();
  if (counts.failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
