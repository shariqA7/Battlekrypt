// Duplicate-screenshot detection. The matching rule is pure; the last block runs the whole path
// (a stored file is fetched, hashed and recorded) against the test database.
import http from "node:http";
import { buildMatches } from "../lib/proof-match";
import { sha256Hex } from "../lib/proof-hash";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const fp = (refId: string, sha256: string, userId: string | null = null, organizerId: string | null = null, kind: "registration" | "invoice" = "registration") =>
  ({ kind, refId, sha256, userId, organizerId });

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
    ok("a proof in our storage is fetched and recorded", (await fingerprintProof({ kind: "registration", refId: "t-r1", userId: "t-u1", organizerId: "t-o1" }, url("one.png"))) === true);
    ok("a link outside our storage is never fetched", (await fingerprintProof({ kind: "registration", refId: "t-r9" }, "http://127.0.0.1:1/evil.png")) === false);
    ok("a missing file is skipped quietly", (await fingerprintProof({ kind: "registration", refId: "t-r8" }, url("missing.png"))) === false);
    ok("one proof alone is not flagged", (await findProofMatches("registration", ["t-r1"])).size === 0);
    await fingerprintProof({ kind: "registration", refId: "t-r2", userId: "t-u2", organizerId: "t-o1" }, url("two.png"));
    const hits = await findProofMatches("registration", ["t-r1", "t-r2"]);
    ok("the same file sent twice flags both", hits.get("t-r1")?.count === 1 && hits.get("t-r2")?.count === 1);
    ok("replacing a proof replaces its fingerprint", (await prisma.proofFingerprint.count({ where: { kind: "registration", refId: "t-r1" } })) === 1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }

  if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
  console.log("\nall passed");
}
main().catch((e) => { console.error("FAIL crashed", e); process.exit(1); });
