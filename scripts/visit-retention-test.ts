// npx tsx scripts/visit-retention-test.ts
import assert from "node:assert/strict";
import { VISIT_DETAIL_RETENTION_DAYS, visitDetailCutoff } from "../lib/visit-retention";

const now = new Date("2026-10-27T12:00:00Z");
assert.equal(VISIT_DETAIL_RETENTION_DAYS, 90);
assert.equal(visitDetailCutoff(now).toISOString(), "2026-07-29T12:00:00.000Z"); // 90 days before
// must outlast the longest feature that reads IPs: integrity checks look back 60 days
assert.ok(VISIT_DETAIL_RETENTION_DAYS > 60);
console.log("visit retention: all checks passed");
