// Applying to a challenge, and the poster picking who gets it.
//
// Flow: paid players/clubs apply -> applications are capped (anti-flooding)
// -> the poster picks up to `slots` applicants and must CONFIRM -> the picked
// ones are accepted, every other applicant is rejected automatically, and the
// challenge moves to in_progress with a deadline the poster chose.

import { prisma } from "@/lib/prisma";
import { getJoinAccess } from "@/lib/services/challenges";
import { notify, notifyMany } from "@/lib/services/notifications";
import { isPosterFrozen } from "@/lib/services/challenge-fulfillment";
import { isUnderReview } from "@/lib/services/challenge-moderation";
import { detectSelectionFlags } from "@/lib/services/challenge-integrity";
import { cashAgeCheck } from "@/lib/challenge-integrity-rules";
import { applyBlocker, selectionBlocker, type EntrantKind } from "@/lib/challenge-rules";
import { checkChallengeInstitutionGate } from "@/lib/services/challenge-institutions";

const DAY = 86_400_000;

type ChallengeRow = NonNullable<Awaited<ReturnType<typeof prisma.challenge.findUnique>>>;

// ------------------------------------------------------------
// What can this viewer do on this challenge?
// ------------------------------------------------------------

export interface ApplyState {
  existing: {
    status: string;
    kind: string;
    entrantName: string;
    message: string | null;
    institutionReview: string;
  } | null;
  player: { rating: number; blocker: string | null } | null;
  teams: { id: string; name: string; rating: number; blocker: string | null }[];
  planBlocked: boolean; // no entrant type is covered by a plan that allows joining
}

export async function getApplyState(userId: string, c: ChallengeRow): Promise<ApplyState> {
  const [access, player, club, existing, activeApplications] = await Promise.all([
    getJoinAccess(userId),
    prisma.playerProfile.findUnique({
      where: { userId },
      include: { gameRatings: { where: { gameId: c.gameId } } },
    }),
    prisma.clubProfile.findUnique({
      where: { userId },
      include: { teams: { where: { gameId: c.gameId }, orderBy: { name: "asc" } } },
    }),
    prisma.challengeApplication.findUnique({
      where: { challengeId_applicantUserId: { challengeId: c.id, applicantUserId: userId } },
    }),
    prisma.challengeApplication.count({ where: { challengeId: c.id, status: "applied" } }),
  ]);

  const alreadyApplied = existing?.status === "applied" || existing?.status === "selected";
  const common = { challenge: c, userId, activeApplications, alreadyApplied };

  // Institution-only challenge: say up front if the viewer's institute (or a
  // team's players) can't take part, instead of failing at "Apply".
  const instituteMessage = async (kind: "player" | "team", clubTeamId: string | null) => {
    if (c.audienceScope !== "institution" || existing) return null;
    const gate = await checkChallengeInstitutionGate(prisma, c, { userId, kind, clubTeamId });
    return "error" in gate ? gate.message : null;
  };
  const playerInstituteBlock = player ? await instituteMessage("player", null) : null;

  const playerRating = player?.gameRatings[0]?.rating ?? 1000;
  const playerState = player
    ? {
        rating: playerRating,
        blocker:
          applyBlocker({ ...common, kind: "player", rating: playerRating, hasPlanAccess: access.asPlayer })?.message ??
          playerInstituteBlock,
      }
    : null;

  const teams =
    club && club.status === "approved"
      ? await Promise.all(
          club.teams.map(async (t) => ({
            id: t.id,
            name: t.name,
            rating: t.rating,
            blocker:
              applyBlocker({ ...common, kind: "team", rating: t.rating, hasPlanAccess: access.asTeam })?.message ??
              (await instituteMessage("team", t.id)),
          }))
        )
      : [];

  return {
    existing: existing
      ? {
          status: existing.status,
          kind: existing.kind,
          entrantName: existing.entrantName,
          message: existing.message,
          institutionReview: existing.institutionReview,
        }
      : null,
    player: playerState,
    teams,
    planBlocked: !access.canJoin,
  };
}

// ------------------------------------------------------------
// Apply / withdraw
// ------------------------------------------------------------

export type ApplyInput = { kind: EntrantKind; clubTeamId?: string; message?: string };

type Failure = { error: string; message: string };
type ApplyOk = { data: { id: string }; posterUserId: string; title: string; entrantName: string };
type SelectOk = {
  data: {
    id: string;
    title: string;
    completeBy: Date;
    selectedUserIds: string[];
    rejectedUserIds: string[];
  };
};

export async function applyToChallenge(userId: string, challengeId: string, input: ApplyInput) {
  const message = input.message?.trim() || null;
  if (message && message.length > 300) {
    return { error: "invalid_message", message: "Keep your note under 300 characters." } as Failure;
  }

  const outcome: ApplyOk | Failure = await prisma.$transaction(async (tx): Promise<ApplyOk | Failure> => {
    // Lock the challenge row so two people applying at once can't both take
    // the last place under the cap.
    await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
    const c = await tx.challenge.findUnique({ where: { id: challengeId } });
    if (!c) return { error: "not_found", message: "Challenge not found." };
    // A poster with an unsettled payment dispute can't take on more challengers.
    if (await isPosterFrozen(c.posterUserId)) {
      return { error: "poster_frozen", message: "This poster's challenges are paused while a payment dispute is settled." };
    }

    // Reported challenges are paused for applications until an admin has looked.
    if (await isUnderReview(c.id)) {
      return { error: "under_review", message: "This challenge is being reviewed after reports. Applications are paused." };
    }
    // Cash prizes are for adults (self-reported profile age).
    if (c.prizeType === "cash") {
      const profile = await prisma.playerProfile.findUnique({ where: { userId }, select: { age: true } });
      const age = cashAgeCheck(profile?.age);
      if (age !== "ok") {
        return {
          error: "age_restricted",
          message: age === "age_required"
            ? "Cash prizes are for players 18 and over. Add your age in your profile to apply."
            : "Cash prizes are only for players 18 and over.",
        };
      }
    }

    const access = await getJoinAccess(userId);
    const existing = await tx.challengeApplication.findUnique({
      where: { challengeId_applicantUserId: { challengeId, applicantUserId: userId } },
    });
    const activeApplications = await tx.challengeApplication.count({ where: { challengeId, status: "applied" } });

    let entrantName: string;
    let rating: number;
    let clubTeamId: string | null = null;

    if (input.kind === "player") {
      const [player, user] = await Promise.all([
        tx.playerProfile.findUnique({
          where: { userId },
          include: { gameRatings: { where: { gameId: c.gameId } } },
        }),
        tx.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
      ]);
      if (!player || !user) return { error: "no_profile", message: "Finish player onboarding first." };
      entrantName = user.displayName;
      rating = player.gameRatings[0]?.rating ?? 1000;
    } else {
      const team = input.clubTeamId
        ? await tx.clubTeam.findUnique({ where: { id: input.clubTeamId }, include: { club: true } })
        : null;
      if (!team || team.club.userId !== userId || team.club.status !== "approved" || team.gameId !== c.gameId) {
        return { error: "invalid_team", message: "Choose one of your club's teams for this game." };
      }
      entrantName = `${team.name} (${team.club.clubName})`;
      rating = team.rating;
      clubTeamId = team.id;
    }

    const blocker = applyBlocker({
      challenge: c,
      userId,
      kind: input.kind,
      rating,
      hasPlanAccess: input.kind === "team" ? access.asTeam : access.asPlayer,
      activeApplications,
      alreadyApplied: existing?.status === "applied" || existing?.status === "selected",
    });
    if (blocker) return { error: blocker.code, message: blocker.message };

    // Turned down by their institute: they can't keep re-applying to its queue.
    if (c.audienceScope === "institution" && existing?.institutionReview === "rejected") {
      return { error: "institute_rejected", message: "Your institute turned down your application for this challenge." };
    }

    // Institution-only: the entrant's institute must take part, a team must be
    // from ONE institute, and the institute's application limit must have room.
    const instGate = await checkChallengeInstitutionGate(tx, c, { userId, kind: input.kind, clubTeamId });
    if ("error" in instGate) return { error: instGate.error, message: instGate.message };

    const data = {
      institutionId: instGate.institutionId,
      routedInstitutionId: instGate.routedInstitutionId,
      institutionReview: instGate.review,
      approvedByInstitutionId: null,
      kind: input.kind,
      clubTeamId,
      entrantName,
      rating,
      message,
      status: "applied" as const,
      decidedAt: null,
    };
    // A withdrawn / not-selected applicant who applies again reuses their row.
    const application = existing
      ? await tx.challengeApplication.update({ where: { id: existing.id }, data })
      : await tx.challengeApplication.create({ data: { challengeId, applicantUserId: userId, ...data } });

    return { data: { id: application.id }, posterUserId: c.posterUserId, title: c.title, entrantName };
  });

  if ("data" in outcome) {
    await notify(outcome.posterUserId, {
      type: "challenge_application",
      title: `New applicant: ${outcome.entrantName}`,
      body: `For "${outcome.title}"`,
      href: `/challenges/${challengeId}`,
    });
  }
  return outcome;
}

export async function withdrawApplication(userId: string, challengeId: string) {
  const app = await prisma.challengeApplication.findUnique({
    where: { challengeId_applicantUserId: { challengeId, applicantUserId: userId } },
  });
  if (!app) return { error: "not_found" as const };
  // Once picked, backing out is a dispute matter (handled in the next part).
  if (app.status !== "applied") return { error: "not_withdrawable" as const };
  await prisma.challengeApplication.update({
    where: { id: app.id },
    data: { status: "withdrawn", decidedAt: new Date() },
  });
  return { data: { id: app.id } };
}

// ------------------------------------------------------------
// Poster side
// ------------------------------------------------------------

export async function listApplicants(challengeId: string) {
  return prisma.challengeApplication.findMany({
    where: { challengeId, status: { in: ["applied", "selected"] } },
    orderBy: [{ rating: "desc" }, { createdAt: "asc" }],
    select: {
      id: true, kind: true, entrantName: true, rating: true, message: true, status: true, createdAt: true,
      institutionReview: true,
      routedInstitutionId: true,
      institution: { select: { name: true } },
    },
  });
}

export async function selectApplicants(
  posterUserId: string,
  challengeId: string,
  chosenIds: string[],
  confirm: boolean
) {
  const result: SelectOk | Failure = await prisma.$transaction(async (tx): Promise<SelectOk | Failure> => {
    await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
    const c = await tx.challenge.findUnique({ where: { id: challengeId } });
    if (!c || c.posterUserId !== posterUserId) return { error: "not_found", message: "Challenge not found." };

    const applied = await tx.challengeApplication.findMany({
      where: { challengeId, status: "applied" },
      select: { id: true, applicantUserId: true, institutionReview: true },
    });
    // Institution-only: the poster can only pick applicants their own institute
    // has approved (everyone else is still turned down below).
    const pickable = c.audienceScope === "institution" ? applied.filter((a) => a.institutionReview === "approved") : applied;
    const blocker = selectionBlocker({
      status: c.status,
      slots: c.slots,
      chosenIds,
      appliedIds: pickable.map((a) => a.id),
      confirm,
    });
    if (blocker) return { error: blocker.code, message: blocker.message };

    const now = new Date();
    const completeBy = new Date(now.getTime() + c.completeWithinDays * DAY);
    // Picked entries start at "playing": proof is due by the challenge deadline.
    await tx.challengeApplication.updateMany({
      where: { id: { in: chosenIds } },
      data: { status: "selected", decidedAt: now, stage: "playing", stageDeadline: completeBy },
    });
    // Everyone else who applied is turned down automatically.
    await tx.challengeApplication.updateMany({
      where: { challengeId, status: "applied" },
      data: { status: "not_selected", decidedAt: now },
    });
    await tx.challenge.update({
      where: { id: challengeId },
      data: { status: "in_progress", selectedAt: now, completeBy },
    });

    const chosen = new Set(chosenIds);
    return {
      data: {
        id: challengeId,
        title: c.title,
        completeBy,
        selectedUserIds: applied.filter((a) => chosen.has(a.id)).map((a) => a.applicantUserId),
        rejectedUserIds: applied.filter((a) => !chosen.has(a.id)).map((a) => a.applicantUserId),
      },
    };
  });

  if ("data" in result) {
    // Look for signs the poster and a picked challenger are linked. Best
    // effort: it must never undo or delay the pick.
    try {
      await detectSelectionFlags(challengeId);
    } catch (e) {
      console.error("collusion check failed", e);
    }
    const { title, completeBy, selectedUserIds, rejectedUserIds } = result.data;
    await Promise.all([
      notifyMany(selectedUserIds, {
        type: "challenge_selected",
        title: `You were chosen: ${title}`,
        body: `Complete it by ${completeBy.toLocaleDateString()}.`,
        href: `/challenges/${challengeId}`,
      }),
      notifyMany(rejectedUserIds, {
        type: "challenge_not_selected",
        title: `Not selected: ${title}`,
        body: "The poster picked other challengers.",
        href: `/challenges/${challengeId}`,
      }),
    ]);
  }
  return result;
}

export async function listMyApplications(userId: string) {
  return prisma.challengeApplication.findMany({
    where: { applicantUserId: userId },
    orderBy: { createdAt: "desc" },
    include: { challenge: { include: { game: { select: { name: true } } } } },
  });
}
