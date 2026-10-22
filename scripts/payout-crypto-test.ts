// Run: npx tsx scripts/payout-crypto-test.ts
import { randomBytes } from "node:crypto";
let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (!c) fails++; };

async function main() {
  delete process.env.PAYOUT_ENCRYPTION_KEY;
  const { encryptPayout, decryptPayout, payoutEncryptionReady } = await import("../lib/payout-crypto");
  ok("not ready without a key", !payoutEncryptionReady());
  ok("refuses to encrypt without a key (fails closed)", (() => { try { encryptPayout("x"); return false; } catch { return true; } })());

  process.env.PAYOUT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  ok("ready with a 32 byte hex key", payoutEncryptionReady());
  const secret = "PK36SCBL0000001123456702 / Sara Khan";
  const enc = encryptPayout(secret);
  ok("round trip", decryptPayout(enc) === secret);
  ok("ciphertext hides the plain text", !enc.includes("PK36") && !enc.includes("Sara"));
  ok("same input encrypts differently each time (random IV)", encryptPayout(secret) !== enc);
  const parts = enc.split(".");
  const flipped = [parts[0], parts[1], parts[2], (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1)].join(".");
  ok("tampered ciphertext is rejected", decryptPayout(flipped) === null);
  ok("tampered tag is rejected", decryptPayout([parts[0], parts[1], (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1), parts[3]].join(".")) === null);
  ok("garbage is rejected", decryptPayout("nonsense") === null && decryptPayout("v1.a.b") === null);
  process.env.PAYOUT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  ok("a different key can't read it", decryptPayout(enc) === null);
  process.env.PAYOUT_ENCRYPTION_KEY = "short";
  ok("a wrong-length key is treated as not configured", !payoutEncryptionReady());
  process.env.PAYOUT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  ok("a base64 key works too", decryptPayout(encryptPayout("hi")) === "hi");

  console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
  process.exit(fails ? 1 : 0);
}
main();
