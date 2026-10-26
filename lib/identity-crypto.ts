// Server only. The verified document number and address are encrypted before they
// reach the database, with the same key as payout details (PAYOUT_ENCRYPTION_KEY),
// so a leaked database backup does not leak them. Fails closed: without the key,
// identity checks are refused instead of stored in plain text.
import { decryptPayout, encryptPayout, payoutEncryptionReady } from "@/lib/payout-crypto";

export type IdentityDetails = { documentNumber: string; address: string };

export const identityCryptoReady = payoutEncryptionReady;

export function sealIdentityDetails(d: IdentityDetails): string {
  return encryptPayout(JSON.stringify(d));
}

export function openIdentityDetails(enc: string | null | undefined): IdentityDetails | null {
  if (!enc) return null;
  const plain = decryptPayout(enc);
  if (!plain) return null;
  try {
    const o = JSON.parse(plain);
    return typeof o.documentNumber === "string" && typeof o.address === "string" ? { documentNumber: o.documentNumber, address: o.address } : null;
  } catch {
    return null;
  }
}
