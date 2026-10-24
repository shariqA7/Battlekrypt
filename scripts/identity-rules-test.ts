// Pure-logic checks for organizer identity verification (no database needed).
//   npx tsx scripts/identity-rules-test.ts
import assert from "node:assert/strict";
import {
  addMonths, identityState, isIdentityVerified, isOwnUpload, isPlausibleDocNumber, normalizeDocNumber, purgeAfterFor,
} from "../lib/identity";
import { hashDocNumber } from "../lib/identity-hash";
import { niceScale } from "../lib/chart-scale";

const now = new Date("2026-10-27T00:00:00Z");
const future = new Date("2028-10-27T00:00:00Z");
const past = new Date("2026-01-01T00:00:00Z");

// document numbers
assert.equal(normalizeDocNumber("35202-1234567-1"), "3520212345671");
assert.equal(normalizeDocNumber(" ab 12-34 "), "AB1234");
assert.ok(isPlausibleDocNumber("35202-1234567-1"));
assert.ok(isPlausibleDocNumber("AB1234567"));
assert.ok(!isPlausibleDocNumber("123"));
assert.ok(!isPlausibleDocNumber("1".repeat(25)));

// keyed hash: same number in different formats matches; different secret or number does not
const h1 = hashDocNumber("35202-1234567-1", "secret-a");
assert.equal(h1, hashDocNumber("3520212345671", "secret-a"));
assert.notEqual(h1, hashDocNumber("35202-1234567-1", "secret-b"));
assert.notEqual(h1, hashDocNumber("35202-1234567-2", "secret-a"));
assert.match(h1, /^[0-9a-f]{64}$/);

// uploads must be inside the user's own folder
assert.ok(isOwnUpload("u1", "u1/abc.jpg"));
assert.ok(!isOwnUpload("u1", "u2/abc.jpg"));
assert.ok(!isOwnUpload("u1", "u1/../u2/abc.jpg"));
assert.ok(!isOwnUpload("u1", "u1/sub/abc.jpg"));
assert.ok(!isOwnUpload("u1", "u1abc.jpg"));
assert.ok(!isOwnUpload("u1", 42));

// states
assert.equal(identityState(null, now), "none");
assert.equal(identityState({ status: "pending", validUntil: null }, now), "pending");
assert.equal(identityState({ status: "rejected", validUntil: null }, now), "rejected");
assert.equal(identityState({ status: "approved", validUntil: future }, now), "approved");
assert.equal(identityState({ status: "approved", validUntil: past }, now), "expired");
assert.ok(isIdentityVerified({ status: "approved", validUntil: future }, now));
assert.ok(!isIdentityVerified({ status: "approved", validUntil: past }, now));
assert.ok(!isIdentityVerified({ status: "pending", validUntil: null }, now));
assert.ok(!isIdentityVerified(null, now));

// retention: sooner after a rejection
const cfg = { idRetentionDays: 30, idRejectedRetentionDays: 7 };
assert.equal(purgeAfterFor("approve", cfg, now).toISOString(), "2026-11-26T00:00:00.000Z");
assert.equal(purgeAfterFor("reject", cfg, now).toISOString(), "2026-11-03T00:00:00.000Z");
assert.equal(addMonths(new Date("2026-10-27T00:00:00Z"), 24).getFullYear(), 2028);

// chart scale: 0-8 by 2, 0-80 by 10, and so on
assert.deepEqual(niceScale(8).ticks, [0, 2, 4, 6, 8]);
assert.deepEqual(niceScale(80).ticks, [0, 10, 20, 30, 40, 50, 60, 70, 80]);
assert.deepEqual(niceScale(800).ticks, [0, 100, 200, 300, 400, 500, 600, 700, 800]);

console.log("identity rules: all checks passed");
