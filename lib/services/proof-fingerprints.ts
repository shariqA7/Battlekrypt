// Duplicate-screenshot detection for payment proofs. FLAG ONLY: nothing here blocks, rejects or
// delays a submission. The reviewer (organizer or admin) just sees "possible duplicate".
import { after } from "next/server";
import type { ProofKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sha256Hex } from "@/lib/proof-hash";
import { buildMatches, type ProofMatch } from "@/lib/proof-match";

export type { ProofMatch };

const MAX_BYTES = 15 * 1024 * 1024;

// Only files in OUR storage are fetched (never an arbitrary link a user typed in).
// NOTE: if proofs move to a private bucket, this must fetch a signed URL instead.
const ownStoragePrefix = () => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/` : null;
};

export type ProofRef = {
  kind: ProofKind;
  refId: string;
  userId?: string | null;
  /** A player profile id, when only that is at hand: resolved to the user it belongs to. */
  playerId?: string | null;
  /** The organizer who reviews this proof (registrations only). */
  organizerId?: string | null;
};

/** Store (or replace) the fingerprint of one proof. */
export async function recordFingerprint(ref: ProofRef & { sha256: string | null; reference: string | null }) {
  const data = { userId: ref.userId ?? null, organizerId: ref.organizerId ?? null, sha256: ref.sha256, reference: ref.reference, createdAt: new Date() };
  await prisma.proofFingerprint.upsert({
    where: { kind_refId: { kind: ref.kind, refId: ref.refId } },
    create: { kind: ref.kind, refId: ref.refId, ...data },
    update: data,
  });
}

/** Fetch the stored screenshot and hash it (null if it can't be fetched). Never throws. */
async function hashStoredFile(url: string): Promise<string | null> {
  try {
    const prefix = ownStoragePrefix();
    if (!prefix || !url.startsWith(prefix)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (!res.ok) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
    return sha256Hex(bytes);
  } catch (e) {
    console.error("[proof-fingerprint] could not fetch", e);
    return null;
  }
}

/**
 * Fingerprint one proof: its screenshot file and/or the typed transaction ID (`reference` is the
 * normalized key from normalizeReference). Records whatever it has. Never throws.
 */
export async function fingerprintProof(ref: ProofRef, url: string | null | undefined, reference?: string | null): Promise<boolean> {
  try {
    const sha256 = url ? await hashStoredFile(url) : null;
    if (!sha256 && !reference) return false;
    let userId = ref.userId ?? null;
    if (!userId && ref.playerId) {
      userId = (await prisma.playerProfile.findUnique({ where: { id: ref.playerId }, select: { userId: true } }))?.userId ?? null;
    }
    await recordFingerprint({ ...ref, userId, sha256, reference: reference ?? null });
    return true;
  } catch (e) {
    console.error("[proof-fingerprint] failed", ref.kind, ref.refId, e);
    return false;
  }
}

/**
 * Fingerprint a proof without slowing the submission down: runs after the response is sent when
 * there is a request to hang it on, and inline otherwise (scripts and tests).
 */
export function queueProofCheck(ref: ProofRef, url: string | null | undefined, reference?: string | null): Promise<unknown> | void {
  if (!url && !reference) return;
  const run = () => fingerprintProof(ref, url, reference);
  try {
    after(run);
  } catch {
    return run();
  }
}

/**
 * For each proof, is the same screenshot file or the same transaction ID on any OTHER submission?
 * Returns an entry only for proofs that have a match. Never says who else used it.
 */
export async function findProofMatches(kind: ProofKind, refIds: string[]): Promise<Map<string, ProofMatch>> {
  if (refIds.length === 0) return new Map();
  const mine = await prisma.proofFingerprint.findMany({ where: { kind, refId: { in: refIds } } });
  if (mine.length === 0) return new Map();
  const hashes = [...new Set(mine.flatMap((m) => (m.sha256 ? [m.sha256] : [])))];
  const refs = [...new Set(mine.flatMap((m) => (m.reference ? [m.reference] : [])))];
  const all = await prisma.proofFingerprint.findMany({
    where: { OR: [...(hashes.length ? [{ sha256: { in: hashes } }] : []), ...(refs.length ? [{ reference: { in: refs } }] : [])] },
  });
  return buildMatches(mine, all);
}
