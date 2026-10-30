// Staff management against a real database: adding, editing, suspending and removing staff,
// and the rules that stop the owner locking themselves out. Needs a migrated, empty Postgres
// (npm test provides one).
import { prisma } from "../lib/prisma";
import { addStaff, listStaff, loadStaffContext, removeStaff, updateStaff } from "../lib/services/staff";
import { hasAccess } from "../lib/staff-permissions";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

async function main() {
  await prisma.user.createMany({ data: [
    { id: "st-owner", email: "owner@x.com", displayName: "Owner", isAdmin: true, staffRole: "super_admin" },
    { id: "st-legacy", email: "legacy@x.com", displayName: "Legacy", isAdmin: true }, // admin from before roles existed
    { id: "st-mgr", email: "mgr@x.com", displayName: "Mgr" },
    { id: "st-plain", email: "plain@x.com", displayName: "Plain" },
  ]});

  ok("a legacy admin (no staff role) keeps full access", (await loadStaffContext("st-legacy"))?.role === "super_admin");
  ok("a normal user is not staff", (await loadStaffContext("st-plain")) === null);

  const added = await addStaff("st-owner", { email: "MGR@x.com", role: "manager" });
  ok("add a manager by email (any letter case)", "ok" in added);
  const ctx = await loadStaffContext("st-mgr");
  ok("manager starts from the manager template", !!ctx && hasAccess(ctx, "approvals", "edit") && !hasAccess(ctx, "payments"));
  ok("adding the same person twice is refused", "error" in (await addStaff("st-owner", { email: "mgr@x.com", role: "admin" })));
  ok("adding an email with no account is refused", "error" in (await addStaff("st-owner", { email: "nobody@x.com", role: "admin" })));
  ok("an invalid role is refused", "error" in (await addStaff("st-owner", { email: "plain@x.com", role: "root" })));

  // The owner decides the manager can't see transactions but can see the ledger.
  await updateStaff("st-owner", "st-mgr", { grants: { approvals: "edit", ledger: "view", payments: "view", bogus: "edit" } });
  let c2 = await loadStaffContext("st-mgr");
  ok("grants are saved", !!c2 && hasAccess(c2, "ledger") && hasAccess(c2, "payments") && !hasAccess(c2, "payments", "edit"));
  await updateStaff("st-owner", "st-mgr", { grants: { approvals: "edit" } });
  c2 = await loadStaffContext("st-mgr");
  ok("taking payments away takes effect straight away", !!c2 && !hasAccess(c2, "payments") && !hasAccess(c2, "ledger"));

  ok("unknown permission keys are never stored", (await prisma.staffPermission.count({ where: { permission: "bogus" } })) === 0);

  await updateStaff("st-owner", "st-mgr", { active: false });
  ok("a suspended manager is no longer staff", (await loadStaffContext("st-mgr")) === null);
  await updateStaff("st-owner", "st-mgr", { active: true });
  ok("reactivating restores access with the same permissions", hasAccess(await loadStaffContext("st-mgr"), "approvals"));

  ok("you can't change your own access", (await updateStaff("st-owner", "st-owner", { role: "manager" })) !== undefined && "error" in (await updateStaff("st-owner", "st-owner", { role: "manager" })));
  ok("you can't remove yourself", "error" in (await removeStaff("st-owner", "st-owner")));

  // Two super admins now (owner + legacy). Demote one: fine. Then the last one can't go.
  ok("a super admin can be demoted while another remains", "ok" in (await updateStaff("st-owner", "st-legacy", { role: "admin" })));
  await prisma.user.update({ where: { id: "st-mgr" }, data: { staffRole: "super_admin" } });
  await prisma.user.update({ where: { id: "st-owner" }, data: { staffActive: false, isAdmin: false } });
  const last = await updateStaff("st-legacy", "st-mgr", { role: "manager" });
  ok("the last active super admin can't be demoted or removed", "error" in last && "error" in (await removeStaff("st-legacy", "st-mgr")));
  await prisma.user.update({ where: { id: "st-owner" }, data: { staffActive: true, isAdmin: true } });

  ok("remove takes the admin access off but keeps the account", "ok" in (await removeStaff("st-owner", "st-legacy")));
  const u = await prisma.user.findUnique({ where: { id: "st-legacy" } });
  ok("removed person is a normal user again", !!u && !u.isAdmin && u.staffRole === null && (await loadStaffContext("st-legacy")) === null);

  const list = await listStaff();
  ok("the staff list shows who added whom", list.some((r) => r.id === "st-mgr") && !list.some((r) => r.id === "st-legacy"));
  ok("every change is in the audit log", (await prisma.adminActionLog.count({ where: { targetType: "Staff" } })) >= 5);

  if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
  console.log("\nall passed");
}
main().catch((e) => { console.error("FAIL crashed", e); process.exit(1); }).finally(() => prisma.$disconnect());
