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
export async function recordFingerprint(ref: ProofRef & { sha256: string }) {
  const data = { userId: ref.userId ?? null, organizerId: ref.organizerId ?? null, sha256: ref.sha256, createdAt: new Date() };
  await prisma.proofFingerprint.upsert({
    where: { kind_refId: { kind: ref.kind, refId: ref.refId } },
    create: { kind: ref.kind, refId: ref.refId, ...data },
    update: data,
  });
}

/** Fetch the stored screenshot, fingerprint it, and record it. Never throws. */
export async function fingerprintProof(ref: ProofRef, url: string): Promise<boolean> {
  try {
    const prefix = ownStoragePrefix();
    if (!prefix || !url.startsWith(prefix)) return false;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (!res.ok) return false;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return false;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return false;
    let userId = ref.userId ?? null;
    if (!userId && ref.playerId) {
      userId = (await prisma.playerProfile.findUnique({ where: { id: ref.playerId }, select: { userId: true } }))?.userId ?? null;
    }
    await recordFingerprint({ ...ref, userId, sha256: sha256Hex(bytes) });
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
export function queueProofCheck(ref: ProofRef, url: string | null | undefined): Promise<unknown> | void {
  if (!url) return;
  const run = () => fingerprintProof(ref, url);
  try {
    after(run);
  } catch {
    return run();
  }
}

/**
 * For each proof, is the very same screenshot on any OTHER submission?
 * Returns an entry only for proofs that have a match. Never says who else used it.
 */
export async function findProofMatches(kind: ProofKind, refIds: string[]): Promise<Map<string, ProofMatch>> {
  if (refIds.length === 0) return new Map();
  const mine = await prisma.proofFingerprint.findMany({ where: { kind, refId: { in: refIds } } });
  if (mine.length === 0) return new Map();
  const all = await prisma.proofFingerprint.findMany({ where: { sha256: { in: [...new Set(mine.map((m) => m.sha256))] } } });
  return buildMatches(mine, all);
}
