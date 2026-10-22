// Payout details (account numbers, IBANs, wallet numbers) are encrypted before they
// reach the database, so a leaked database backup doesn't leak bank details.
// AES-256-GCM with a key from PAYOUT_ENCRYPTION_KEY (32 bytes as 64 hex characters, or
// base64). Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Without the key, saving payout details is refused (fail closed) instead of storing
// them in plain text.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer | null {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

export const payoutEncryptionReady = () => key() !== null;

// "v1.<iv>.<tag>.<ciphertext>" (all base64url)
export function encryptPayout(plain: string): string {
  const k = key();
  if (!k) throw new Error("PAYOUT_ENCRYPTION_KEY is missing or not 32 bytes");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptPayout(stored: string): string | null {
  const k = key();
  if (!k) return null;
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null; // wrong key or tampered data
  }
}
