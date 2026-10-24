// Runs every scripts/*-test.ts, each against a FRESH copy of the migrated database.
//
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/battlekrypt_test npm test
//
// - Safety: it DROPS and recreates that database over and over, so it refuses to run unless
//   the database name contains "test". Point it at a throwaway database, never your real one.
// - It migrates once into a template database, then clones that template for each script
//   (a clone takes well under a second), so every script starts from the same clean state.
// - A script FAILS if it exits non-zero or prints any line starting with "FAIL". (Counting
//   only FAIL lines is not enough: a script that crashes prints none.)
//
//   npm test                      all scripts
//   npm test -- age-gate phase8   only scripts whose file name contains one of these words
//   npm test -- --reuse-template  skip re-migrating if the template database already exists (fast reruns
//                                 while you edit code; use a fresh run after changing migrations)
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const base = process.env.TEST_DATABASE_URL;
if (!base) {
  console.error("Set TEST_DATABASE_URL to a throwaway Postgres database, e.g.\n  postgresql://postgres:postgres@localhost:5432/battlekrypt_test");
  process.exit(2);
}
const url = new URL(base);
const dbName = decodeURIComponent(url.pathname.slice(1));
if (!/test/i.test(dbName)) {
  console.error(`Refusing to run: the database name "${dbName}" doesn't contain "test". This runner drops and recreates it.`);
  process.exit(2);
}
const templateName = `${dbName}_template`;
const withDb = (name) => { const u = new URL(base); u.pathname = `/${name}`; return u.toString(); };
const admin = () => new Client({ connectionString: withDb("postgres") });

async function sql(statement) {
  const c = admin();
  await c.connect();
  try { await c.query(statement); } finally { await c.end(); }
}
const quote = (name) => `"${name.replace(/"/g, '""')}"`;
const run = (cmd, args, env, timeoutMs) =>
  spawnSync(cmd, args, { env: { ...process.env, ...env }, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" });

// ---- 1. migrate once, into a template
const args = process.argv.slice(2);
const reuse = args.includes("--reuse-template");
const exists = async () => {
  const c = admin();
  await c.connect();
  try { return (await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [templateName])).rowCount > 0; } finally { await c.end(); }
};
if (reuse && (await exists())) {
  console.log(`Reusing the existing template database (${templateName}).`);
} else {
  await sql(`DROP DATABASE IF EXISTS ${quote(templateName)} WITH (FORCE)`);
  await sql(`CREATE DATABASE ${quote(templateName)}`);
  console.log(`Migrating a template database (${templateName})...`);
  const mig = run("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: withDb(templateName), DIRECT_URL: withDb(templateName) }, 10 * 60 * 1000);
  if (mig.status !== 0) {
    console.error(mig.stdout, mig.stderr);
    console.error("\nMigrations failed to apply on an empty database.");
    process.exit(1);
  }
}

// ---- 2. one fresh clone per script
const filters = args.filter((a) => !a.startsWith("--"));
const files = readdirSync("scripts")
  .filter((f) => f.endsWith("-test.ts"))
  .filter((f) => filters.length === 0 || filters.some((w) => f.includes(w)))
  .sort();

const results = [];
for (const file of files) {
  await sql(`DROP DATABASE IF EXISTS ${quote(dbName)} WITH (FORCE)`);
  await sql(`CREATE DATABASE ${quote(dbName)} TEMPLATE ${quote(templateName)}`);
  const started = Date.now();
  const r = run("npx", ["tsx", `scripts/${file}`], { DATABASE_URL: withDb(dbName), DIRECT_URL: withDb(dbName) }, 3 * 60 * 1000);
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const pass = (out.match(/^PASS/gm) ?? []).length;
  const failLines = out.split("\n").filter((l) => /^FAIL/.test(l));
  const timedOut = r.error?.code === "ETIMEDOUT";
  const ok = r.status === 0 && failLines.length === 0 && !timedOut;
  results.push({ file, ok, pass, fail: failLines.length, status: r.status, ms: Date.now() - started });
  console.log(`${ok ? "ok  " : "FAIL"} ${file.padEnd(30)} ${String(pass).padStart(4)} passed${failLines.length ? `, ${failLines.length} failed` : ""}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  if (!ok) {
    for (const l of failLines) console.log(`       ${l}`);
    if (r.status !== 0) {
      const tail = out.split("\n").filter((l) => l.trim() && !/^\s+at /.test(l)).slice(-8).join("\n       ");
      console.log(`       exit code ${timedOut ? "(timed out)" : r.status}; last output:\n       ${tail}`);
    }
  }
}

await sql(`DROP DATABASE IF EXISTS ${quote(dbName)} WITH (FORCE)`);
if (!reuse) await sql(`DROP DATABASE IF EXISTS ${quote(templateName)} WITH (FORCE)`);

const bad = results.filter((r) => !r.ok);
const total = results.reduce((n, r) => n + r.pass, 0);
console.log(`\n${results.length - bad.length}/${results.length} scripts ok, ${total} checks passed${bad.length ? `, ${bad.length} script(s) FAILED: ${bad.map((b) => b.file).join(", ")}` : ""}`);
process.exit(bad.length ? 1 : 0);
