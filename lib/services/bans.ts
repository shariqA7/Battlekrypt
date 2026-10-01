import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// A ban is active while it hasn't been lifted and hasn't expired.
function activeWhere(userId: string) {
  const now = new Date();
  return {
    userId,
    liftedAt: null,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}

export async function getActiveBan(userId: string) {
  return prisma.accountBan.findFirst({
    where: activeWhere(userId),
    orderBy: { createdAt: "desc" },
  });
}

// For API routes: returns a 403 response if the caller is banned, else null.
// Banned users can still sign in (and see why), but can't DO anything.
export async function banGuard(userId: string) {
  const ban = await getActiveBan(userId);
  if (!ban) return null;
  return NextResponse.json(
    {
      error: {
        code: "account_banned",
        message: "Your account is restricted. Contact customer support.",
        reason: ban.reason,
        endsAt: ban.endsAt,
      },
    },
    { status: 403 }
  );
}

// days = null -> permanent.
export async function banUser(
  userId: string,
  reason: string,
  days: number | null,
  adminId: string
) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "not_found" as const };
  if (target.isAdmin) return { error: "is_admin" as const };

  const ban = await prisma.accountBan.create({
    data: {
      userId,
      reason,
      createdById: adminId,
      endsAt: days === null ? null : new Date(Date.now() + days * 86_400_000),
    },
  });
  await prisma.adminActionLog.create({
    data: { adminId, action: "banned_user", targetType: "User", targetId: userId, notes: reason },
  });
  return { data: ban };
}

export async function liftBan(banId: string, adminId: string) {
  const ban = await prisma.accountBan.findUnique({ where: { id: banId } });
  if (!ban || ban.liftedAt) return { error: "not_found" as const };
  await prisma.$transaction([
    prisma.accountBan.update({
      where: { id: banId },
      data: { liftedAt: new Date(), liftedById: adminId },
    }),
    prisma.adminActionLog.create({
      data: { adminId, action: "lifted_ban", targetType: "User", targetId: ban.userId },
    }),
  ]);
  return { data: { id: banId } };
}

export async function listActiveBans() {
  const now = new Date();
  return prisma.accountBan.findMany({
    where: { liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true, displayName: true } } },
  });
}
