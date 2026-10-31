// Private payment proofs: where the files live and who a stored value can belong to.
// Pure (no database, no Supabase) so it can be tested on its own.
//
// New proofs are uploaded to the PRIVATE bucket "payment-proofs" under the uploader's own folder
// (`<user id>/<kind>/<random>.<ext>`) and the database stores that PATH. Nobody opens a file by
// its path: they ask /api/proofs/..., which checks who they are and hands out a 5-minute link.
// Older proofs are plain public links; they keep working until scripts/migrate-proofs-to-private.ts
// moves them.

export const PROOF_BUCKET = "payment-proofs";
export const PUBLIC_BUCKET = "tournament-assets";
export const PROOF_LINK_SECONDS = 300;

const PATH_RE = /^([A-Za-z0-9_-]{1,64})\/([a-z-]{3,30})\/([A-Za-z0-9-]{8,64})\.([a-z0-9]{1,5})$/;

/** `<owner>/<kind>/<random>.<ext>`: the only shape the app ever writes to the private bucket. */
export function isPrivateProofPath(value: string): boolean {
  return PATH_RE.test(value);
}

/** The user folder a private proof path sits in, or null if it isn't one. */
export function proofPathOwner(value: string): string | null {
  const m = PATH_RE.exec(value);
  return m ? m[1] : null;
}

/** A private proof path counts as yours only if it sits in your own folder. */
export function ownsProofPath(value: string, userId: string): boolean {
  return proofPathOwner(value) === userId;
}

const isHttp = (v: string) => /^https?:\/\//i.test(v);

/**
 * What a submitted proof must look like: one of the caller's own private paths, or (older proofs
 * and tests) an http(s) link. Anything else, including someone else's path, is refused: otherwise a
 * person could name another user's file and have it shown to them.
 */
export function normalizeProofInput(value: unknown, userId: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > 1000) return null;
  if (isHttp(v)) return v;
  return userId && ownsProofPath(v, userId) ? v : null;
}

/** The storage path inside `bucket` when `url` is a public link into it, else null. */
export function publicUrlToPath(url: string, supabaseUrl: string | undefined, bucket: string): string | null {
  if (!supabaseUrl) return null;
  const prefix = `${supabaseUrl}/storage/v1/object/public/${bucket}/`;
  if (!url.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(url.slice(prefix.length).split("?")[0]);
  } catch {
    return null;
  }
}

/** Where a viewer is sent for a stored value: an old public link as it is, a private path via the server. */
export const isLegacyPublicLink = (value: string) => isHttp(value);
