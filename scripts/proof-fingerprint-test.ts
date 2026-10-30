// Duplicate-screenshot detection. The matching rule is pure; the last block runs the whole path
// (a stored file is fetched, hashed and recorded) against the test database.
import http from "node:http";
import { buildMatches, normalizeReference, parseReference, type Print } from "../lib/proof-match";
import { sha256Hex } from "../lib/proof-hash";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const fp = (refId: string, sha256: string | null, userId: string | null = null, organizerId: string | null = null, kind: "registration" | "invoice" = "registration", reference: string | null = null): Print =>
  ({ kind, refId, sha256, userId, organizerId, reference });

async function main() {
  ok("the same bytes hash the same, different bytes differ",
    sha256Hex(Buffer.from("a")) === sha256Hex(Buffer.from("a")) && sha256Hex(Buffer.from("a")) !== sha256Hex(Buffer.from("b")));

  const a = fp("r1", "H1", "u1", "o1");
  const b = fp("r2", "H1", "u2", "o1");
  const c = fp("r3", "H1", "u1", "o2");
  const d = fp("r4", "H2", "u3", "o1");
  const m = buildMatches([a, b, c, d], [a, b, c, d]);
  ok("a proof alone is never flagged", !m.has("r4"));
  ok("every submission of the same file is flagged", m.has("r1") && m.has("r2") && m.has("r3"));
  ok("counts the OTHER submissions, not itself", m.get("r1")?.count === 2);
  ok("notices the same account reusing a file", m.get("r1")?.sameUser === true && m.get("r2")?.sameUser === false);
  ok("notices the same organizer, and not a different one", m.get("r1")?.sameOrganizer === true && m.get("r2")?.sameOrganizer === true && m.get("r3")?.sameOrganizer === false && m.get("r3")?.count === 2);
  const inv = buildMatches([fp("i1", "H1", "u9", null, "invoice")], [fp("i1", "H1", "u9", null, "invoice"), a]);
  ok("catches the same file across different kinds of payment", inv.get("i1")?.count === 1);
  ok("a row with the same kind and id is the proof itself, not a match", buildMatches([a], [a]).size === 0);

  // ---- the typed transaction ID
  ok("a transaction ID ignores case, spaces and dashes", normalizeReference("ab-12 34 56") === "AB123456");
  ok("too short or all-the-same IDs are not accepted", normalizeReference("12345") === null && normalizeReference("000000") === null && normalizeReference(undefined) === null);
  ok("parseReference keeps a tidy display copy and a matching key", parseReference("  txn  98-76 54 ")?.display === "txn 98-76 54" && parseReference("txn  98-76 54")?.key === "TXN987654");
  const x1 = fp("x1", "F1", "u1", "o1", "registration", "TXN111222");
  const x2 = fp("x2", "F2", "u2", "o2", "registration", "TXN111222"); // different screenshot, same ID: re-saved copy
  const x3 = fp("x3", "F3", "u3", "o3", "registration", "TXN333444");
  const mr = buildMatches([x1, x2, x3], [x1, x2, x3]);
  ok("the same transaction ID is a duplicate even with a different screenshot", mr.get("x1")?.by === "reference" && mr.get("x2")?.count === 1);
  ok("a different ID and file is not flagged", !mr.has("x3"));
  const both = buildMatches([x1], [x1, fp("x9", "F1", "u5", "o9", "registration", "TXN111222")]);
  ok("same file and same ID reports both", both.get("x1")?.by === "both");
  const noFile = buildMatches([fp("n1", null, null, null, "registration", "TXN555666")], [fp("n1", null, null, null, "registration", "TXN555666"), fp("n2", null, null, null, "invoice", "TXN555666")]);
  ok("a proof whose file couldn't be read still matches by ID, and null hashes never match each other", noFile.get("n1")?.by === "reference" && buildMatches([fp("a1", null)], [fp("a1", null), fp("a2", null)]).size === 0);

  // ---- the whole path, against the test database
  const { prisma } = await import("../lib/prisma");
  const { fingerprintProof, findProofMatches } = await import("../lib/services/proof-fingerprints");
  const body = Buffer.from("pretend this is a screenshot");
  const server = http.createServer((req, res) => { if (req.url?.includes("missing")) { res.statusCode = 404; res.end(); } else res.end(body); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  const url = (n: string) => `http://127.0.0.1:${port}/storage/v1/object/public/tournament-assets/${n}`;
  try {
    ok("a proof in our storage is fetched and recorded", (await fingerprintProof({ kind: "registration", refId: "t-r1", userId: "t-u1", organizerId: "t-o1" }, url("one.png"), "TXN000AAA")) === true);
    ok("a link outside our storage is never fetched", (await fingerprintProof({ kind: "registration", refId: "t-r9" }, "http://127.0.0.1:1/evil.png")) === false);
    ok("a missing file is skipped quietly", (await fingerprintProof({ kind: "registration", refId: "t-r8" }, url("missing.png"))) === false);
    ok("one proof alone is not flagged", (await findProofMatches("registration", ["t-r1"])).size === 0);
    await fingerprintProof({ kind: "registration", refId: "t-r2", userId: "t-u2", organizerId: "t-o1" }, url("two.png"), "TXN000BBB");
    const hits = await findProofMatches("registration", ["t-r1", "t-r2"]);
    ok("the same file sent twice flags both", hits.get("t-r1")?.count === 1 && hits.get("t-r2")?.count === 1);
    await fingerprintProof({ kind: "registration", refId: "t-r3", userId: "t-u3" }, "http://127.0.0.1:1/evil.png", "TXN000AAA");
    ok("a typed ID alone is recorded and matches without any file", (await findProofMatches("registration", ["t-r3"])).get("t-r3")?.by === "reference");
    ok("replacing a proof replaces its fingerprint", (await prisma.proofFingerprint.count({ where: { kind: "registration", refId: "t-r1" } })) === 1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }

  if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
  console.log("\nall passed");
}
main().catch((e) => { console.error("FAIL crashed", e); process.exit(1); });
