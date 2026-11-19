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

export type NotificationFilter = "all" | "unread";

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

// One page of a person's notifications, newest first. `cursor` is the id of the
// last item already shown. Reading `limit + 1` rows tells us whether more exist.
export async function listNotificationsPage(
  userId: string,
  opts: { filter?: NotificationFilter; cursor?: string | null; limit?: number } = {}
): Promise<{ items: NotificationDTO[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 15, 1), 50);
  const rows = await prisma.notification.findMany({
    where: { userId, ...(opts.filter === "unread" && { readAt: null }) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
  });
  const page = rows.slice(0, limit);
  return {
    items: page.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      href: n.href,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  };
}

// Marks one notification read. Scoped to the owner so ids can't be guessed.
export async function markRead(userId: string, id: string) {
  await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
}
