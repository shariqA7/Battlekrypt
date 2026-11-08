// Staff permissions: the rules (who may open what), and guard rails so a future admin page or
// API route can't be added without a permission check. Pure: needs no database.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  API_FOLDER_AREAS, ROLE_TEMPLATES, STAFF_PERMISSION_KEYS, areaForAdminPath, hasAccess, visibleAreas,
  type StaffContext,
} from "../lib/staff-permissions";
import { ADMIN_NAV_ITEMS, ADMIN_SUBTABS } from "../components/admin/adminNav";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

const sup: StaffContext = { userId: "s", role: "super_admin", grants: {} };
const mgr: StaffContext = { userId: "m", role: "manager", grants: { ...ROLE_TEMPLATES.manager } };
const noMoney: StaffContext = { userId: "a", role: "admin", grants: { ...ROLE_TEMPLATES.admin, payments: undefined } as never };

// --- the rules
ok("super admin can open and edit every area, and the staff page",
  [...STAFF_PERMISSION_KEYS, "staff" as const].every((a) => hasAccess(sup, a, "edit")));
ok("nobody is staff when there is no context", !hasAccess(null, "users") && visibleAreas(undefined).length === 0);
ok("manager can view the areas it was given", hasAccess(mgr, "approvals") && hasAccess(mgr, "traffic"));
ok("view does not include edit", hasAccess(mgr, "users", "view") && !hasAccess(mgr, "users", "edit"));
ok("edit includes view", hasAccess(mgr, "approvals", "view") && hasAccess(mgr, "approvals", "edit"));
ok("manager template has no money areas or ledger",
  !(["payments", "deposits", "currencies", "plans", "ledger"] as const).some((a) => hasAccess(mgr, a)));
ok("admin template has no ledger until it is switched on", !hasAccess({ userId: "a", role: "admin", grants: ROLE_TEMPLATES.admin }, "ledger"));
ok("the ledger can be granted like any other area", hasAccess({ userId: "a", role: "admin", grants: { ledger: "view" } }, "ledger"));
ok("only the super admin reaches the staff page",
  !hasAccess({ userId: "a", role: "admin", grants: ROLE_TEMPLATES.admin }, "staff") && !hasAccess(mgr, "staff"));
ok("hiding payments leaves the rest of an admin's access alone", !hasAccess(noMoney, "payments") && hasAccess(noMoney, "users", "edit"));
ok("visibleAreas lists only what a manager can open", !visibleAreas(mgr).includes("payments") && visibleAreas(mgr).includes("approvals"));

// --- URL -> area
ok("dashboard is open to all staff (null area)", areaForAdminPath("/admin") === null);
ok("plan payments need the payments permission, not approvals", areaForAdminPath("/admin/approvals/plan-payments") === "payments");
ok("other approval queues need approvals", areaForAdminPath("/admin/approvals/clubs") === "approvals");
ok("ledger and staff pages map", areaForAdminPath("/admin/ledger/reports") === "ledger" && areaForAdminPath("/admin/staff") === "staff");
ok("an unknown admin page is locked to the super admin", areaForAdminPath("/admin/brand-new-thing") === "staff");

// --- every sidebar item and sub tab resolves to a real area
const known = new Set<string>([...STAFF_PERMISSION_KEYS, "staff"]);
ok("every sidebar item maps to a known area",
  ADMIN_NAV_ITEMS.every((i) => { const a = areaForAdminPath(i.href); return a === null || known.has(a); }));
ok("only the Staff item is super-admin-only",
  ADMIN_NAV_ITEMS.filter((i) => areaForAdminPath(i.href) === "staff").map((i) => i.href).join() === "/admin/staff");
ok("every sub tab maps to a permission (none fall through to staff)",
  Object.values(ADMIN_SUBTABS).flat().every((t) => { const a = areaForAdminPath(t.href); return a !== null && a !== "staff"; }));

// --- Games section
const adminCtx: StaffContext = { userId: "a", role: "admin", grants: { ...ROLE_TEMPLATES.admin } };
ok("Games is a switch on the Staff page (Platform group)", STAFF_PERMISSION_KEYS.includes("games" as never));
ok("admin role can edit games, manager can only view them", hasAccess(adminCtx, "games", "edit") && hasAccess(mgr, "games", "view") && !hasAccess(mgr, "games", "edit"));
ok("staff with no Games switch can't open it", !hasAccess({ userId: "x", role: "admin", grants: { users: "edit" } }, "games"));
ok("games pages and API belong to the games area", ["/admin/games", "/admin/games/new", "/admin/games/abc-123"].every((p) => areaForAdminPath(p) === "games") && API_FOLDER_AREAS.games === "games");
ok("the games approvals tab still belongs to approvals, not games", areaForAdminPath("/admin/approvals/games") === "approvals");
ok("Games has a sidebar item", ADMIN_NAV_ITEMS.some((i) => i.href === "/admin/games"));
const gameApi = readFileSync("app/api/admin/games/[id]/route.ts", "utf8");
ok("deleting a game is super admin only (no switch can grant it)", /export async function DELETE[\s\S]*?requireAdmin\("staff"\)/.test(gameApi));
ok("reading is view access, changing is edit access", /export async function GET[\s\S]*?requireAdmin\("games", "view"\)/.test(gameApi) && /export async function PATCH[\s\S]*?requireAdmin\("games"\)/.test(gameApi));
const gameList = readFileSync("app/api/admin/games/route.ts", "utf8");
ok("the list is view access, adding is edit access", /export async function GET[\s\S]*?requireAdmin\("games", "view"\)/.test(gameList) && /export async function POST[\s\S]*?requireAdmin\("games"\)/.test(gameList));

// --- guard rails on the source: nothing admin goes unchecked
function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const apiDirs = readdirSync("app/api/admin").filter((d) => statSync(join("app/api/admin", d)).isDirectory());
ok("every /api/admin folder has an area", apiDirs.every((d) => d in API_FOLDER_AREAS));
const unchecked = walk("app/api/admin")
  .filter((f) => f.endsWith("route.ts") && !f.startsWith("app/api/admin/dashboard"))
  .filter((f) => /requireAdmin\(\s*\)/.test(readFileSync(f, "utf8")) || !/requireAdmin\(/.test(readFileSync(f, "utf8")));
ok(`every admin API route checks an area${unchecked.length ? ` (missing: ${unchecked.join(", ")})` : ""}`, unchecked.length === 0);
const uncheckedPages = walk("app/(main)/(admin)/admin")
  .filter((f) => /(page|layout)\.tsx$/.test(f) && f !== "app/(main)/(admin)/admin/page.tsx" && f !== "app/(main)/(admin)/admin/layout.tsx")
  .filter((f) => /requireAdminPage\(\s*\)/.test(readFileSync(f, "utf8")) || !/require(AdminPage|StaffPage)\(/.test(readFileSync(f, "utf8")));
ok(`every admin page checks an area${uncheckedPages.length ? ` (missing: ${uncheckedPages.join(", ")})` : ""}`, uncheckedPages.length === 0);

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall passed");
