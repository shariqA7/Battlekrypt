// Spotting poster/challenger pairs that may be the same person or working
// together, and the admin's response. Everything here is a SIGNAL for a human
// to review — nothing is ever acted on automatically, because shared networks
// are normal (families, internet cafés, mobile carriers).
import { prisma } from "@/lib/prisma";
import {
  REPEAT_PAIR_MIN, REPEAT_PAIR_WINDOW_DAYS, SESSION_LOOKBACK_DAYS, classifyOverlap,
} from "@/lib/challenge-integrity-rules";
import { adminFailEntry } from "@/lib/services/challenge-fulfillment";

const DAY = 86_400_000;

async function flagIfNew(
  challengeId: string, applicationId: string, posterUserId: string, challengerUserId: string,
  kind: "same_device" | "same_network" | "repeat_pair", details: string
) {
  // The unique (applicationId, kind) makes this safe to call twice.
  await prisma.challengeFlag.upsert({
    where: { applicationId_kind: { applicationId, kind } },
    update: {},
    create: { challengeId, applicationId, posterUserId, challengerUserId, kind, details },
  });
}

// Called once a poster has picked challengers.
export async function detectSelectionFlags(challengeId: string) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: { posterUserId: true, applications: { where: { status: "selected" }, select: { id: true, applicantUserId: true, entrantName: true } } },
  });
  if (!challenge) return 0;
  const since = new Date(Date.now() - SESSION_LOOKBACK_DAYS * DAY);
  let created = 0;

  for (const entry of challenge.applications) {
    const sessions = await prisma.visitSession.findMany({
      where: { userId: { in: [challenge.posterUserId, entry.applicantUserId] }, createdAt: { gte: since }, ip: { not: null } },
      select: { userId: true, ip: true, userAgent: true },
    });
    const posterS = sessions.filter((s) => s.userId === challenge.posterUserId);
    const challengerS = sessions.filter((s) => s.userId === entry.applicantUserId);

    const shared = [...new Set(challengerS.map((s) => s.ip as string))].filter((ip) => posterS.some((p) => p.ip === ip));
    if (shared.length > 0) {
      const perIp = await prisma.visitSession.groupBy({ by: ["ip", "userId"], where: { ip: { in: shared }, userId: { not: null }, createdAt: { gte: since } } });
      const accountsPerIp = new Map<string, number>();
      for (const row of perIp) accountsPerIp.set(row.ip as string, (accountsPerIp.get(row.ip as string) ?? 0) + 1);

      const overlap = classifyOverlap(posterS, challengerS, accountsPerIp);
      if (overlap) {
        const text = overlap.kind === "same_device"
          ? `Poster and challenger used the same network and browser (IP ${overlap.ips.join(", ")}).`
          : `Poster and challenger used the same IP address (${overlap.ips.join(", ")}). This can be a shared household or café.`;
        await flagIfNew(challengeId, entry.id, challenge.posterUserId, entry.applicantUserId, overlap.kind, text);
        created++;
      }
    }

    // The same two accounts being paired again and again looks like farming.
    const earlier = await prisma.challengeApplication.count({
      where: {
        applicantUserId: entry.applicantUserId, status: "selected", id: { not: entry.id },
        createdAt: { gte: new Date(Date.now() - REPEAT_PAIR_WINDOW_DAYS * DAY) },
        challenge: { posterUserId: challenge.posterUserId },
      },
    });
    if (earlier + 1 >= REPEAT_PAIR_MIN) {
      await flagIfNew(challengeId, entry.id, challenge.posterUserId, entry.applicantUserId, "repeat_pair",
        `The same poster and challenger have now been paired ${earlier + 1} times in ${REPEAT_PAIR_WINDOW_DAYS} days.`);
      created++;
    }
  }
  return created;
}

export async function listOpenFlags() {
  const rows = await prisma.challengeFlag.findMany({ where: { status: "open" }, orderBy: { createdAt: "asc" } });
  if (rows.length === 0) return [];
  const [challenges, users, apps] = await Promise.all([
    prisma.challenge.findMany({ where: { id: { in: rows.map((r) => r.challengeId) } }, select: { id: true, title: true, status: true, posterName: true } }),
    prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => [r.posterUserId, r.challengerUserId]) } }, select: { id: true, email: true } }),
    prisma.challengeApplication.findMany({ where: { id: { in: rows.map((r) => r.applicationId) } }, select: { id: true, stage: true, entrantName: true } }),
  ]);
  const c = new Map(challenges.map((x) => [x.id, x]));
  const u = new Map(users.map((x) => [x.id, x.email]));
  const a = new Map(apps.map((x) => [x.id, x]));
  return rows.map((r) => ({
    ...r,
    challenge: c.get(r.challengeId) ?? null,
    posterEmail: u.get(r.posterUserId) ?? null,
    challengerEmail: u.get(r.challengerUserId) ?? null,
    entry: a.get(r.applicationId) ?? null,
  }));
}

export async function countOpenFlags() {
  return prisma.challengeFlag.count({ where: { status: "open" } });
}

type Failure = { error: string; message: string };

export async function resolveFlag(
  adminId: string,
  flagId: string,
  input: { action: "dismiss" | "fail_entry"; note: string }
): Promise<{ data: { id: string } } | Failure> {
  const note = input.note.trim();
  if (note.length < 5) return { error: "validation_error", message: "Add a note explaining the decision." };
  const flag = await prisma.challengeFlag.findUnique({ where: { id: flagId } });
  if (!flag) return { error: "not_found", message: "Flag not found." };
  if (flag.status !== "open") return { error: "already_resolved", message: "This flag has already been reviewed." };

  if (input.action === "fail_entry") {
    const failed = await adminFailEntry(adminId, flag.applicationId, note);
    if ("error" in failed) return failed;
  }
  await prisma.$transaction([
    prisma.challengeFlag.update({
      where: { id: flagId },
      data: { status: input.action === "fail_entry" ? "actioned" : "dismissed", adminNote: note, reviewedById: adminId, reviewedAt: new Date() },
    }),
    prisma.adminActionLog.create({
      data: { adminId, action: input.action === "fail_entry" ? "failed_flagged_entry" : "dismissed_challenge_flag", targetType: "ChallengeFlag", targetId: flagId, notes: note },
    }),
  ]);
  return { data: { id: flagId } };
}
