// One-time fix: keeps database code out of the browser bundle.
// Moves the pure plan rules from lib/plans.ts into lib/plan-limits.ts and makes
// lib/plans.ts re-export them, so existing imports keep working.
// Run from the project folder:  node split-plans.mjs
import fs from "node:fs";

const PLANS = "lib/plans.ts";
const LIMITS = "lib/plan-limits.ts";
const RULES = "lib/custom-plan-rules.ts";
const fail = (m) => { console.error("STOPPED, nothing was changed: " + m); process.exit(1); };

if (!fs.existsSync(PLANS)) fail(`${PLANS} not found. Run this from the project's root folder.`);
const raw = fs.readFileSync(PLANS, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const s = raw.replace(/\r\n/g, "\n");

if (s.includes('export * from "@/lib/plan-limits"')) fail("lib/plans.ts is already split. Nothing to do.");
if (fs.existsSync(LIMITS) && fs.readFileSync(LIMITS, "utf8").trim().length > 0)
  fail(`${LIMITS} already has content. Send it to me instead of overwriting it.`);

const a = s.indexOf("export async function resolvePlan");
const b = s.indexOf("// ------------------------------------------------------------\n// Derived flags");
const c = s.indexOf("export async function getPaidPlanCodes");
const d = s.indexOf("// Same lapse rule as resolvePlan");
if ([a, b, c, d].some((i) => i < 0) || !(a < b && b < c && c < d))
  fail("lib/plans.ts doesn't look like the version I expected. Send it to me.");
const cm = s.lastIndexOf("// Codes of every paid plan", c);
if (cm < b) fail("couldn't find the comment above getPaidPlanCodes. Send lib/plans.ts to me.");

const resolveFn = s.slice(a, b).trimEnd();
const paidFn = s.slice(c, d).trimEnd();
const paidNote = s.slice(cm, c);

let pure = s.slice(0, a) + s.slice(b, cm) + s.slice(d);
pure = pure.replace('import { prisma } from "@/lib/prisma";\n', "");
if (pure.includes('@/lib/prisma')) fail("the rules part still imports the database. Send lib/plans.ts to me.");
pure = pure.replace(
  "// Subscription plans (Phase 5, spec §7).",
  "// Subscription plans (Phase 5, spec §7): the pure part. No database import, so browser components\n" +
  "// can use it. The functions that read the Plan table live in lib/plans.ts, which re-exports\n" +
  "// everything here, so existing imports keep working."
);

const server =
`// Subscription plans: the functions that read the Plan table. Server only.
// The rules, limit shapes and pure helpers live in lib/plan-limits.ts (safe for browser code) and
// are re-exported here, so \`import ... from "@/lib/plans"\` keeps working for server code.
import type { PlanAudience } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FREE_PLAN_CODE, parseLimits, type EffectivePlan, type PlanHolder } from "@/lib/plan-limits";

export * from "@/lib/plan-limits";

// ------------------------------------------------------------
// Effective plan for an account
// ------------------------------------------------------------

${resolveFn}

${paidNote}${paidFn}
`;

let rules = null;
if (fs.existsSync(RULES)) {
  const r = fs.readFileSync(RULES, "utf8");
  if (r.includes('from "@/lib/plans"')) rules = r.replace('from "@/lib/plans"', 'from "@/lib/plan-limits"');
}

fs.copyFileSync(PLANS, PLANS + ".bak");
const out = (t) => t.replace(/\n/g, eol);
fs.writeFileSync(LIMITS, out(pure));
fs.writeFileSync(PLANS, out(server));
if (rules !== null) fs.writeFileSync(RULES, rules);

console.log("Done.");
console.log(` - ${LIMITS} created (${pure.split("\n").length} lines)`);
console.log(` - ${PLANS} now holds only the database functions (backup: ${PLANS}.bak)`);
console.log(rules !== null ? ` - ${RULES} now imports from @/lib/plan-limits` : ` - ${RULES}: no change needed`);
