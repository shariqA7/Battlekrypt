// Reports and admin removal of challenges. Anyone signed in can report a
// challenge; enough open reports hide it from the list until an admin looks.
import { prisma } from "@/lib/prisma";
import { notify, notifyMany } from "@/lib/services/notifications";
import { banUser } from "@/lib/services/bans";
import {
  MAX_REPORTS_PER_DAY, REPORT_HIDE_THRESHOLD, isReportReason,
} from "@/lib/challenge-integrity-rules";

type Failure = { error: string; message: string };
const fail = (error: string, message: string): Failure => ({ error, message });

// Statuses a viewer can actually see, and so can report.
const REPORTABLE = ["open", "in_progress", "completed"];
// Statuses an admin can take down. A challenge with picked challengers is
// handled through disputes and bans instead, so nobody who earned a prize
// loses it to a takedown.
const REMOVABLE = ["open", "pending_review"];

export async function reportChallenge(
  userId: string,
  challengeId: string,
  input: { reason?: unknown; details?: unknown }
): Promise<{ data: { id: string } } | Failure> {
  if (!isReportReason(input.reason)) return fail("validation_error", "Choose a reason.");
  const details = typeof input.details === "string" ? input.details.trim() : "";
  if (details.length > 500) return fail("validation_error", "Keep the details under 500 characters.");
  if (input.reason === "other" && details.length < 5) return fail("validation_error", "Say what's wrong.");

  const c = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { id: true, status: true, posterUserId: true } });
  if (!c || !REPORTABLE.includes(c.status)) return fail("not_found", "Challenge not found.");
  if (c.posterUserId === userId) return fail("own_challenge", "You can't report your own challenge.");

  const today = await prisma.challengeReport.count({
    where: { reporterId: userId, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
  });
  if (today >= MAX_REPORTS_PER_DAY) return fail("rate_limited", "You've sent a lot of reports today. Please try again tomorrow.");

  try {
    const report = await prisma.challengeReport.create({
      data: { challengeId, reporterId: userId, reason: input.reason, details: details || null },
    });
    return { data: { id: report.id } };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return fail("already_reported", "You've already reported this challenge.");
    throw e;
  }
}

// Challenge IDs with enough open reports to be hidden from the list.
export async function hiddenByReportsIds(): Promise<string[]> {
  const groups = await prisma.challengeReport.groupBy({
    by: ["challengeId"],
    where: { status: "open" },
    _count: { _all: true },
  });
  return groups.filter((g) => g._count._all >= REPORT_HIDE_THRESHOLD).map((g) => g.challengeId);
}

export async function isUnderReview(challengeId: string): Promise<boolean> {
  const n = await prisma.challengeReport.count({ where: { challengeId, status: "open" } });
  return n >= REPORT_HIDE_THRESHOLD;
}

export async function listReportedChallenges() {
  const groups = await prisma.challengeReport.groupBy({ by: ["challengeId"], where: { status: "open" }, _count: { _all: true } });
  if (groups.length === 0) return [];
  const challenges = await prisma.challenge.findMany({
    where: { id: { in: groups.map((g) => g.challengeId) } },
    include: {
      game: { select: { name: true } },
      poster: { select: { email: true } },
      reports: { where: { status: "open" }, orderBy: { createdAt: "asc" }, include: { reporter: { select: { email: true } } } },
    },
  });
  return challenges.sort((a, b) => b.reports.length - a.reports.length);
}

export type ModerationBan = { days: number | null } | null;

export async function resolveReports(
  adminId: string,
  challengeId: string,
  input: { action: "remove" | "dismiss"; note: string; ban?: ModerationBan }
): Promise<{ data: { id: string } } | Failure> {
  const note = input.note.trim();
  if (note.length < 5) return fail("validation_error", "Add a note explaining the decision.");
  if (note.length > 1000) return fail("validation_error", "Keep the note under 1000 characters.");

  const now = new Date();
  const out = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
    const c = await tx.challenge.findUnique({
      where: { id: challengeId },
      include: { applications: { where: { status: "applied" }, select: { applicantUserId: true } } },
    });
    if (!c) return fail("not_found", "Challenge not found.");
    const open = await tx.challengeReport.count({ where: { challengeId, status: "open" } });
    if (open === 0) return fail("no_open_reports", "There are no open reports on this challenge.");

    const notes: { userId: string; title: string; body?: string }[] = [];
    if (input.action === "remove") {
      if (!REMOVABLE.includes(c.status)) {
        return fail("not_removable", "Challengers have already been picked, so it can't be taken down. Decide any dispute instead, or ban the poster.");
      }
      await tx.challenge.update({ where: { id: c.id }, data: { status: "removed", reviewNote: note, reviewedById: adminId, reviewedAt: now } });
      await tx.challengeApplication.updateMany({ where: { challengeId: c.id, status: "applied" }, data: { status: "not_selected", decidedAt: now } });
      notes.push({ userId: c.posterUserId, title: `Challenge removed: ${c.title}`, body: `An admin removed it after reports. ${note}` });
      for (const a of c.applications) notes.push({ userId: a.applicantUserId, title: `Challenge removed: ${c.title}`, body: "It was taken down by an admin." });
    }
    await tx.challengeReport.updateMany({
      where: { challengeId, status: "open" },
      data: { status: input.action === "remove" ? "actioned" : "dismissed", adminNote: note, resolvedById: adminId, resolvedAt: now },
    });
    await tx.adminActionLog.create({
      data: { adminId, action: input.action === "remove" ? "removed_challenge" : "dismissed_challenge_reports", targetType: "Challenge", targetId: challengeId, notes: note },
    });
    return { data: { id: c.id }, notes, posterUserId: c.posterUserId, title: c.title };
  });
  if ("error" in out) return out;

  for (const n of out.notes) await notify(n.userId, { type: "challenge_removed", title: n.title, body: n.body, href: `/challenges/${challengeId}` });
  if (input.ban) {
    // A ban doesn't undo the decision if it can't be applied (e.g. an admin's account).
    await banUser(out.posterUserId, `Your challenge "${out.title}" was removed for breaking the rules: ${note}`, input.ban.days, adminId);
    const open = await prisma.challenge.findMany({
      where: { posterUserId: out.posterUserId, status: { in: ["open", "pending_review"] } },
      select: { id: true, title: true, applications: { where: { status: "applied" }, select: { applicantUserId: true } } },
    });
    for (const o of open) {
      await prisma.challenge.update({ where: { id: o.id }, data: { status: "cancelled" } });
      await prisma.challengeApplication.updateMany({ where: { challengeId: o.id, status: "applied" }, data: { status: "not_selected", decidedAt: now } });
      await notifyMany(o.applications.map((a) => a.applicantUserId), { type: "challenge_cancelled", title: `Challenge cancelled: ${o.title}`, href: `/challenges/${o.id}` });
    }
  }
  return { data: out.data };
}

export async function countReportedChallenges() {
  const groups = await prisma.challengeReport.groupBy({ by: ["challengeId"], where: { status: "open" } });
  return groups.length;
}
