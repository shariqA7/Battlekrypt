// Staff management: who is on the team, what each person can open, and the rules that keep the
// owner from locking themselves out. Every change is written to AdminActionLog.
import { prisma } from "@/lib/prisma";
import {
  ROLE_TEMPLATES, STAFF_PERMISSION_KEYS,
  type StaffAccessLevel, type StaffContext, type StaffGrants, type StaffPermissionKey, type StaffRoleName,
} from "@/lib/staff-permissions";

/** The signed-in person's staff context, or null if they are not active staff. */
export async function loadStaffContext(userId: string): Promise<StaffContext | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isAdmin: true, staffRole: true, staffActive: true, staffPermissions: { select: { permission: true, access: true } } },
  });
  if (!u?.isAdmin || !u.staffActive) return null;
  // An admin with no staff role is one created before roles existed: full access, as before.
  const role: StaffRoleName = u.staffRole ?? "super_admin";
  return { userId: u.id, role, grants: toGrants(u.staffPermissions) };
}

function toGrants(rows: { permission: string; access: StaffAccessLevel }[]): StaffGrants {
  const grants: StaffGrants = {};
  for (const r of rows) if ((STAFF_PERMISSION_KEYS as string[]).includes(r.permission)) grants[r.permission as StaffPermissionKey] = r.access;
  return grants;
}

/** Keep only known permission keys and valid levels (never trust the browser). */
export function cleanGrants(input: unknown): StaffGrants {
  const out: StaffGrants = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if ((STAFF_PERMISSION_KEYS as string[]).includes(k) && (v === "view" || v === "edit")) out[k as StaffPermissionKey] = v;
  }
  return out;
}

export type StaffRow = {
  id: string; name: string; email: string | null; role: StaffRoleName; active: boolean;
  addedAt: string | null; addedBy: string | null; grants: StaffGrants;
};

export async function listStaff(): Promise<StaffRow[]> {
  const users = await prisma.user.findMany({
    where: { OR: [{ isAdmin: true }, { staffRole: { not: null } }] },
    orderBy: [{ staffAddedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, displayName: true, email: true, isAdmin: true, staffRole: true, staffActive: true, staffAddedAt: true, staffAddedById: true,
      staffPermissions: { select: { permission: true, access: true } },
    },
  });
  const adders = await prisma.user.findMany({
    where: { id: { in: users.flatMap((u) => (u.staffAddedById ? [u.staffAddedById] : [])) } },
    select: { id: true, displayName: true },
  });
  const nameOf = new Map(adders.map((a) => [a.id, a.displayName]));
  return users.map((u) => ({
    id: u.id, name: u.displayName, email: u.email, role: u.staffRole ?? "super_admin",
    active: u.isAdmin && u.staffActive,
    addedAt: u.staffAddedAt ? u.staffAddedAt.toISOString() : null,
    addedBy: u.staffAddedById ? nameOf.get(u.staffAddedById) ?? null : null,
    grants: toGrants(u.staffPermissions),
  }));
}

type StaffError = "not_found" | "no_account" | "already_staff" | "invalid_role" | "self" | "last_super_admin";
const log = (adminId: string, action: string, targetId: string, notes: string) =>
  prisma.adminActionLog.create({ data: { adminId, action, targetType: "Staff", targetId, notes } });

async function activeSuperAdmins() {
  return prisma.user.count({ where: { isAdmin: true, staffActive: true, OR: [{ staffRole: "super_admin" }, { staffRole: null }] } });
}

function grantRows(userId: string, grants: StaffGrants) {
  return Object.entries(grants).map(([permission, access]) => ({ userId, permission, access: access as StaffAccessLevel }));
}

/** Add someone (they must already have an account) as an admin or manager. */
export async function addStaff(actorId: string, input: { email: string; role: string; grants?: unknown }): Promise<{ error: StaffError } | { ok: true; id: string }> {
  if (input.role !== "admin" && input.role !== "manager" && input.role !== "super_admin") return { error: "invalid_role" };
  const target = await prisma.user.findFirst({ where: { email: { equals: input.email.trim(), mode: "insensitive" } }, select: { id: true, isAdmin: true, staffRole: true } });
  if (!target) return { error: "no_account" };
  if (target.isAdmin) return { error: "already_staff" };
  const role = input.role as StaffRoleName;
  const grants = role === "super_admin" ? {} : input.grants === undefined ? ROLE_TEMPLATES[role] : cleanGrants(input.grants);
  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { isAdmin: true, staffRole: role, staffActive: true, staffAddedById: actorId, staffAddedAt: new Date() } }),
    prisma.staffPermission.deleteMany({ where: { userId: target.id } }),
    prisma.staffPermission.createMany({ data: grantRows(target.id, grants) }),
  ]);
  await log(actorId, "staff_added", target.id, `${role}: ${Object.keys(grants).join(", ") || "all areas"}`);
  return { ok: true, id: target.id };
}

/** Change someone's role, permissions, or active state. */
export async function updateStaff(
  actorId: string,
  targetId: string,
  patch: { role?: string; grants?: unknown; active?: boolean },
): Promise<{ error: StaffError } | { ok: true }> {
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, staffRole: true, isAdmin: true, staffActive: true } });
  if (!target || (!target.isAdmin && !target.staffRole)) return { error: "not_found" };
  if (targetId === actorId) return { error: "self" }; // you can't demote, suspend or edit yourself

  const wasSuper = (target.staffRole ?? "super_admin") === "super_admin" && target.isAdmin && target.staffActive;
  const newRole = patch.role === undefined ? undefined : (["super_admin", "admin", "manager"].includes(patch.role) ? (patch.role as StaffRoleName) : null);
  if (newRole === null) return { error: "invalid_role" };
  const losesSuper = wasSuper && ((newRole !== undefined && newRole !== "super_admin") || patch.active === false);
  if (losesSuper && (await activeSuperAdmins()) <= 1) return { error: "last_super_admin" };

  const data: Record<string, unknown> = {};
  if (newRole !== undefined) data.staffRole = newRole;
  if (patch.active !== undefined) { data.staffActive = patch.active; data.isAdmin = patch.active; }
  const ops = [prisma.user.update({ where: { id: targetId }, data })];
  let grants: StaffGrants | null = null;
  if (patch.grants !== undefined) {
    grants = cleanGrants(patch.grants);
    ops.push(prisma.staffPermission.deleteMany({ where: { userId: targetId } }) as never, prisma.staffPermission.createMany({ data: grantRows(targetId, grants) }) as never);
  }
  await prisma.$transaction(ops);
  const bits = [newRole !== undefined && `role=${newRole}`, patch.active !== undefined && (patch.active ? "reactivated" : "suspended"), grants && `permissions: ${Object.entries(grants).map(([k, v]) => `${k}:${v}`).join(", ") || "none"}`].filter(Boolean).join("; ");
  await log(actorId, "staff_updated", targetId, bits);
  return { ok: true };
}

/** Remove someone from staff. Their account stays; only the admin access goes. */
export async function removeStaff(actorId: string, targetId: string): Promise<{ error: StaffError } | { ok: true }> {
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, staffRole: true, isAdmin: true, staffActive: true } });
  if (!target || (!target.isAdmin && !target.staffRole)) return { error: "not_found" };
  if (targetId === actorId) return { error: "self" };
  const isSuper = (target.staffRole ?? "super_admin") === "super_admin" && target.isAdmin && target.staffActive;
  if (isSuper && (await activeSuperAdmins()) <= 1) return { error: "last_super_admin" };
  await prisma.$transaction([
    prisma.user.update({ where: { id: targetId }, data: { isAdmin: false, staffRole: null, staffActive: true, staffAddedById: null, staffAddedAt: null } }),
    prisma.staffPermission.deleteMany({ where: { userId: targetId } }),
  ]);
  await log(actorId, "staff_removed", targetId, "admin access removed");
  return { ok: true };
}
