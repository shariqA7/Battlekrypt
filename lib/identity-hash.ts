// Server only (uses Node crypto): the keyed fingerprint of an ID number.
import { createHmac } from "node:crypto";
import { normalizeDocNumber } from "@/lib/identity";

// Lets us recognise the same document later without keeping the number. A plain
// hash of an ID number is easy to guess; the secret (IDENTITY_HASH_SECRET) is
// what prevents that, so keep it private and never change it once in use.
export function hashDocNumber(raw: string, secret: string): string {
  return createHmac("sha256", secret).update(normalizeDocNumber(raw)).digest("hex");
}
