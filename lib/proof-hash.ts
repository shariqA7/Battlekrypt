// Fingerprint of a payment screenshot: the SHA-256 of the exact file.
//
// Only exact copies are matched on purpose. Bank and wallet receipts from the same app look almost
// the same even when the amount and transaction ID differ, so a "looks similar" picture match
// would flag innocent payments. A re-saved or re-screenshotted copy is therefore NOT caught here;
// the reliable way to catch those is a typed transaction ID (see the Phase 7 notes).
import { createHash } from "node:crypto";

export const sha256Hex = (bytes: Buffer | Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
