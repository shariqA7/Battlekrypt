// Site feedback: anyone can send a feature idea or a problem report; admins with the Feedback
// permission read them, set a status and leave a note. The sender is told when it's decided
// (signed-in senders only: a visitor leaves no account to notify).
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notifications";
import {
  FEEDBACK_KINDS, FEEDBACK_NOTE_MAX, FEEDBACK_STATUSES, FEEDBACK_STATUS_LABEL, validateFeedback,
  type FeedbackKindT, type FeedbackStatusT,
} from "@/lib/feedback-rules";

export async function submitFeedback(input: { userId: string | null; kind: unknown; message: unknown; email?: unknown; pageUrl?: unknown }) {
  const v = validateFeedback({ kind: input.kind, message: input.message, email: input.email, pageUrl: input.pageUrl });
  if (!v.ok) return { error: "validation_error" as const, message: v.message };
  const row = await prisma.feedback.create({
    data: { kind: v.value.kind, message: v.value.message, pageUrl: v.value.pageUrl, contactEmail: v.value.contactEmail, userId: input.userId },
    select: { id: true },
  });
  return { data: row };
}

export type FeedbackFilter = { status?: string | null; kind?: string | null };

export async function listFeedbackForAdmin(filter: FeedbackFilter = {}, take = 100) {
  const status = FEEDBACK_STATUSES.includes(filter.status as FeedbackStatusT) ? (filter.status as FeedbackStatusT) : undefined;
  const kind = FEEDBACK_KINDS.includes(filter.kind as FeedbackKindT) ? (filter.kind as FeedbackKindT) : undefined;
  const rows = await prisma.feedback.findMany({
    where: { ...(status ? { status } : {}), ...(kind ? { kind } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(take, 1), 200),
  });
  const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, email: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    ...r,
    sender: r.userId ? (byId.get(r.userId)?.displayName ?? "Deleted user") : "Visitor",
    senderEmail: r.contactEmail ?? (r.userId ? (byId.get(r.userId)?.email ?? null) : null),
  }));
}

export async function countFeedbackByStatus() {
  const groups = await prisma.feedback.groupBy({ by: ["status"], _count: { _all: true } });
  const out: Record<string, number> = Object.fromEntries(FEEDBACK_STATUSES.map((s) => [s, 0]));
  for (const g of groups) out[g.status] = g._count._all;
  return out;
}

export const countOpenFeedback = () => prisma.feedback.count({ where: { status: "open" } });

export async function updateFeedback(input: { adminId: string; id: string; status?: unknown; adminNote?: unknown }) {
  const f = await prisma.feedback.findUnique({ where: { id: input.id } });
  if (!f) return { error: "not_found" as const };
  const data: { status?: FeedbackStatusT; adminNote?: string | null; handledById?: string; handledAt?: Date } = {};
  if (input.status !== undefined) {
    if (!FEEDBACK_STATUSES.includes(input.status as FeedbackStatusT)) return { error: "validation_error" as const, message: "Unknown status." };
    data.status = input.status as FeedbackStatusT;
  }
  if (input.adminNote !== undefined) {
    const note = typeof input.adminNote === "string" ? input.adminNote.trim() : "";
    if (note.length > FEEDBACK_NOTE_MAX) return { error: "validation_error" as const, message: `The note can be at most ${FEEDBACK_NOTE_MAX} characters.` };
    data.adminNote = note || null;
  }
  if (Object.keys(data).length === 0) return { error: "validation_error" as const, message: "Nothing to update." };
  data.handledById = input.adminId;
  data.handledAt = new Date();
  const updated = await prisma.feedback.update({ where: { id: f.id }, data });

  // Tell a signed-in sender when it moves to a decision (not for "open" or "looking into it").
  const decided = data.status && data.status !== f.status && ["planned", "done", "declined"].includes(data.status);
  if (decided && f.userId) {
    await notify(f.userId, {
      type: "feedback",
      title: `Your feedback is now: ${FEEDBACK_STATUS_LABEL[data.status!]}`,
      body: updated.adminNote ? updated.adminNote : "Thanks for helping us improve BattleKrypt.",
    });
  }
  return { data: updated };
}

export async function deleteFeedback(id: string) {
  const r = await prisma.feedback.deleteMany({ where: { id } });
  return r.count === 0 ? { error: "not_found" as const } : { data: { id } };
}
