import { prisma } from "@/lib/prisma";

export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  href?: string;
}

// Notifications are best-effort: failing to tell someone must never undo the
// thing that happened, so errors are logged and swallowed.
export async function notify(userId: string, n: NotificationInput) {
  try {
    await prisma.notification.create({ data: { userId, ...n } });
  } catch (e) {
    console.error("notify failed", e);
  }
}

export async function notifyMany(userIds: string[], n: NotificationInput) {
  if (userIds.length === 0) return;
  try {
    await prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, ...n })) });
  } catch (e) {
    console.error("notifyMany failed", e);
  }
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
