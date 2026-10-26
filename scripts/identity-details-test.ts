// npx tsx scripts/identity-details-test.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

async function main() {
  process.env.PAYOUT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const { sealIdentityDetails, openIdentityDetails, identityCryptoReady } =
    await import("../lib/identity-crypto");

  assert.ok(identityCryptoReady());
  const d = {
    documentNumber: "35202-1234567-1",
    address: "House 5, Street 2, Gulberg, Lahore",
  };
  const sealed = sealIdentityDetails(d);
  assert.ok(
    !sealed.includes("35202") && !sealed.includes("Gulberg"),
    "ciphertext must not contain the plain text",
  );
  assert.deepEqual(openIdentityDetails(sealed), d);
  assert.notEqual(
    sealIdentityDetails(d),
    sealed,
    "random IV: same input encrypts differently",
  );

  // tampering or a missing value fails closed
  assert.equal(openIdentityDetails(sealed.slice(0, -4) + "AAAA"), null);
  assert.equal(openIdentityDetails(null), null);
  assert.equal(openIdentityDetails("not-a-ciphertext"), null);

  // a different key cannot read it
  process.env.PAYOUT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  assert.equal(openIdentityDetails(sealed), null);

  console.log("identity details: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
