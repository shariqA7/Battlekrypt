// Browser code must never pull in server-only code. A "use client" file that (directly or through
// other files) imports the database, Prisma, Node built-ins or next/headers breaks `next build`,
// and TypeScript can't see it. This walks the imports of every "use client" file and fails with the
// chain when it finds one. No database needed.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const SKIP = new Set(["node_modules", ".next", ".git", "scripts", "prisma"]);
const FORBIDDEN_PKG = [/^pg$/, /^@prisma\//, /^node:/, /^(fs|net|tls|dns|child_process|os|path)$/, /^server-only$/, /^next\/headers$/, /^sharp$/];
const FORBIDDEN_FILES = ["lib/prisma.ts"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const isServerActions = (src: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(src);
const isClient = (src: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);

/** Value imports only: `import type ...` and `import { type A }` (all specifiers typed) are erased. */
function valueImports(src: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+([^;'"]*?)\s*from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[4]) { out.push(m[4]); continue; }
    const clause = m[2].trim();
    if (/^type\s/.test(clause)) continue;
    const named = clause.match(/\{([^}]*)\}/);
    if (named && !clause.replace(/\{[^}]*\}/, "").replace(/[,\s]/g, "") && named[1].split(",").map((s) => s.trim()).filter(Boolean).every((s) => /^type\s/.test(s))) continue;
    out.push(m[3]);
  }
  return out;
}

function resolveLocal(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };

const files = walk(ROOT);
const cache = new Map<string, string>();
const read = (f: string) => cache.get(f) ?? (cache.set(f, readFileSync(f, "utf8")), cache.get(f)!);

// Does importing `start` pull in something server-only? Returns the chain, or null.
function findViolation(start: string): string[] | null {
  const seen = new Set<string>([start]);
  const queue: string[][] = [[start]];
  while (queue.length) {
    const chain = queue.shift()!;
    const file = chain[chain.length - 1];
    for (const spec of valueImports(read(file))) {
      const bad = FORBIDDEN_PKG.some((r) => r.test(spec));
      if (bad) return [...chain.map(rel), spec];
      const target = resolveLocal(spec, file);
      if (!target) continue;
      if (FORBIDDEN_FILES.includes(rel(target))) return [...chain.map(rel), rel(target)];
      if (isServerActions(read(target))) continue; // server actions: the browser only gets a call stub
      if (!seen.has(target)) { seen.add(target); queue.push([...chain, target]); }
    }
  }
  return null;
}

const clients = files.filter((f) => isClient(read(f)));
ok(`found the "use client" files (${clients.length})`, clients.length > 20);
for (const f of clients) {
  const v = findViolation(f);
  ok(`${rel(f)} stays browser-safe${v ? `: ${v.join(" -> ")}` : ""}`, v === null);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
