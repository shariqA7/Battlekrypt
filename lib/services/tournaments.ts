// Shared service layer for tournament reads/writes.
//
// Both the /api route handlers (the contract mobile will eventually consume)
// and the Next.js Server Components (web pages) call these same functions —
// the web app avoids a wasteful self-fetch over HTTP, while the exposed
// route handlers give mobile/external clients the identical logic.
// Business rules live here ONCE, not duplicated between a page and a route.

import { prisma } from "@/lib/prisma";
import { makeTournamentSlug } from "@/lib/slug";
import type { Prisma, TournamentStatus, TournamentType, TournamentMode, EntryType } from "@prisma/client";

export interface TournamentListFilters {
  game?: string;
  type?: TournamentType;
  mode?: TournamentMode;
  entryType?: EntryType;
  status?: TournamentStatus;
  search?: string;
  page?: number;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function listTournaments(filters: TournamentListFilters) {
  const page = Math.max(filters.page ?? 1, 1);
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const where: Prisma.TournamentWhereInput = {
    // Public browse only ever shows tournaments past the draft stage —
    // drafts are only visible to their owning organizer (see getMyTournaments).
    status: filters.status ?? { not: "draft" },
    ...(filters.type && { type: filters.type }),
    ...(filters.mode && { mode: filters.mode }),
    ...(filters.entryType && { entryType: filters.entryType }),
    ...(filters.game && { game: { name: { equals: filters.game, mode: "insensitive" } } }),
    ...(filters.search && {
      name: { contains: filters.search, mode: "insensitive" },
    }),
  };

  const [data, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      include: {
        game: true,
        organizer: { select: { id: true, orgName: true } },
      },
      orderBy: { startAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.tournament.count({ where }),
  ]);

  return { data, page, limit, total };
}

export async function getTournamentById(idOrSlug: string) {
  return prisma.tournament.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      game: true,
      organizer: true,
      stages: { orderBy: { order: "asc" } },
      rules: true,
      _count: { select: { registrations: true } },
    },
  });
}

export interface CreateTournamentInput {
  organizerId: string;
  gameId: string;
  name: string;
  description?: string;
  bannerUrl?: string;
  type: TournamentType;
  mode: TournamentMode;
  maxTeamSize?: number;
  maxTeams: number;
  playersPerRoom?: number;
  format: Prisma.TournamentCreateInput["format"];
  entryType: EntryType;
  entryFeeAmount?: number;
  entryFeeCurrency?: string;
  paymentInstructions?: string;
  prizePoolAmount?: number;
  prizePoolCurrency?: string;
  customFields?: unknown;
  rules?: string[]; // Phase 1: free-text rules
  startAt?: Date;
}

export async function createTournament(input: CreateTournamentInput) {
  return prisma.tournament.create({
    data: {
      slug: makeTournamentSlug(input.name),
      organizer: { connect: { id: input.organizerId } },
      game: { connect: { id: input.gameId } },
      name: input.name,
      description: input.description,
      bannerUrl: input.bannerUrl,
      type: input.type,
      mode: input.mode,
      maxTeamSize: input.maxTeamSize,
      maxTeams: input.maxTeams,
      playersPerRoom: input.playersPerRoom,
      format: input.format,
      entryType: input.entryType,
      entryFeeAmount: input.entryFeeAmount,
      entryFeeCurrency: input.entryFeeCurrency,
      paymentInstructions: input.paymentInstructions,
      prizePoolAmount: input.prizePoolAmount,
      prizePoolCurrency: input.prizePoolCurrency,
      customFields: input.customFields as Prisma.InputJsonValue,
      startAt: input.startAt,
      status: "draft",
      rules: input.rules
        ? {
          create: input.rules.map((description) => ({ description })),
        }
        : undefined,
    },
    include: { rules: true },
  });
}

// Publishing is gated on organizer approval — enforced here so it can't be
// bypassed by hitting the route handler directly with a crafted request.
export async function publishTournament(tournamentId: string, organizerId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { organizer: true },
  });

  if (!tournament) return { error: "not_found" as const };
  if (tournament.organizerId !== organizerId) return { error: "forbidden" as const };
  if (tournament.status !== "draft") return { error: "invalid_status" as const };

  // Enforced here, not just at the route level — publishTournament is the
  // actual boundary that matters if anything else ever calls it directly.
  const organizerUser = await prisma.user.findUnique({
    where: { id: tournament.organizer.userId },
  });
  if (organizerUser?.kycStatus !== "approved") {
    return { error: "organizer_not_approved" as const };
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "published" },
  });

  return { data: updated };
}

// ------------------------------------------------------------
// REGISTRATION
// ------------------------------------------------------------

export interface RegisterInput {
  tournamentId: string;
  playerId: string;
  customFieldResponses?: unknown;
  paymentProofUrl?: string;
  teamName?: string;
  teamMemberPlayerIds?: string[]; // for duo/squad modes
}

export async function registerForTournament(input: RegisterInput) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    include: { _count: { select: { registrations: true } } },
  });

  if (!tournament) return { error: "not_found" as const };

  if (!["published", "registration_open"].includes(tournament.status)) {
    return { error: "registration_closed" as const };
  }

  if (tournament._count.registrations >= tournament.maxTeams) {
    return { error: "full" as const };
  }

  // Prevent anyone in this registration — the registering player OR any
  // named teammate — from already being registered for this tournament,
  // either solo or as a member of another team (the original check only
  // looked at Registration.playerId for the single registering player,
  // which is null for team registrations and ignored teammates entirely,
  // so the same person could end up on two teams in one tournament).
  const allPlayerIds = [input.playerId, ...(input.teamMemberPlayerIds ?? [])];
  const existing = await prisma.registration.findFirst({
    where: {
      tournamentId: input.tournamentId,
      OR: [
        { playerId: { in: allPlayerIds } },
        { teamEntry: { members: { some: { playerId: { in: allPlayerIds } } } } },
      ],
    },
  });
  if (existing) return { error: "already_registered" as const };

  const paymentStatus =
    tournament.entryType === "free"
      ? ("waived" as const)
      : input.paymentProofUrl
        ? ("unpaid" as const) // stays unpaid until organizer verifies the screenshot
        : null;

  if (tournament.entryType === "paid" && !input.paymentProofUrl) {
    return { error: "payment_proof_required" as const };
  }

  // Squad/duo mode: create a TeamEntry + members. Solo: register the player directly.
  if (tournament.mode !== "solo" && input.teamMemberPlayerIds?.length) {
    const teamEntry = await prisma.teamEntry.create({
      data: {
        tournamentId: input.tournamentId,
        name: input.teamName ?? "Unnamed team",
        members: {
          create: [input.playerId, ...input.teamMemberPlayerIds].map((playerId) => ({
            playerId,
          })),
        },
      },
    });

    const registration = await prisma.registration.create({
      data: {
        tournamentId: input.tournamentId,
        teamEntryId: teamEntry.id,
        paymentStatus: paymentStatus ?? "unpaid",
        paymentProofUrl: input.paymentProofUrl,
        customFieldResponses: input.customFieldResponses as Prisma.InputJsonValue,
      },
    });
    return { data: registration };
  }

  const registration = await prisma.registration.create({
    data: {
      tournamentId: input.tournamentId,
      playerId: input.playerId,
      paymentStatus: paymentStatus ?? "unpaid",
      paymentProofUrl: input.paymentProofUrl,
      customFieldResponses: input.customFieldResponses as Prisma.InputJsonValue,
    },
  });

  return { data: registration };
}

export async function listRegistrations(
  tournamentId: string,
  organizerId: string,
  status?: string
) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };
  if (tournament.organizerId !== organizerId) return { error: "forbidden" as const };

  const registrations = await prisma.registration.findMany({
    where: {
      tournamentId,
      ...(status ? { status: status as never } : {}),
    },
    include: {
      player: { include: { user: { select: { displayName: true } } } },
      teamEntry: { include: { members: true } },
    },
    orderBy: { registeredAt: "asc" },
  });

  return { data: registrations };
}

export async function approveRegistration(registrationId: string, organizerId: string) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: true },
  });
  if (!registration) return { error: "not_found" as const };
  if (registration.tournament.organizerId !== organizerId) return { error: "forbidden" as const };

  const updated = await prisma.registration.update({
    where: { id: registrationId },
    data: {
      status: "approved",
      approvedAt: new Date(),
      // Paid entries get marked paid on approval, since approval implies the
      // organizer verified the payment screenshot. Free/waived entries stay as-is.
      paymentStatus:
        registration.paymentStatus === "unpaid" ? "paid" : registration.paymentStatus,
    },
  });

  return { data: updated };
}

export async function rejectRegistration(
  registrationId: string,
  organizerId: string,
  reason?: string
) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: true },
  });
  if (!registration) return { error: "not_found" as const };
  if (registration.tournament.organizerId !== organizerId) return { error: "forbidden" as const };

  const updated = await prisma.registration.update({
    where: { id: registrationId },
    data: { status: "rejected" },
  });

  return { data: updated, reason };
}

// ------------------------------------------------------------
// ROOM REVEAL — time-gated at the service layer, not just the UI
// ------------------------------------------------------------

export async function getRoomForPlayer(stageId: string, playerId: string) {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    include: { tournament: true },
  });
  if (!stage) return { error: "not_found" as const };

  // Confirm this player has an approved registration for this tournament
  const registration = await prisma.registration.findFirst({
    where: {
      tournamentId: stage.tournamentId,
      status: "approved",
      OR: [
        { playerId },
        { teamEntry: { members: { some: { playerId } } } },
      ],
    },
  });
  if (!registration) return { error: "not_registered" as const };

  if (!stage.roomId || !stage.roomRevealAt) {
    return { error: "room_not_set" as const };
  }

  if (new Date() < stage.roomRevealAt) {
    return { error: "not_yet_revealed" as const, revealAt: stage.roomRevealAt };
  }

  return { data: { roomId: stage.roomId, roomPassword: stage.roomPassword } };
}

export async function getMyRegistrations(playerId: string) {
  return prisma.registration.findMany({
    where: {
      OR: [
        { playerId },
        { teamEntry: { members: { some: { playerId } } } },
      ],
    },
    include: {
      tournament: { include: { game: true } },
    },
    orderBy: { registeredAt: "desc" },
  });
}

export async function getMyTournaments(organizerId: string) {
  return prisma.tournament.findMany({
    where: { organizerId },
    include: {
      game: true,
      _count: { select: { registrations: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ------------------------------------------------------------
// ADMIN
// ------------------------------------------------------------

export async function listPendingOrganizers() {
  return prisma.organizerProfile.findMany({
    where: { user: { kycStatus: { in: ["none", "pending"] } } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function approveOrganizer(organizerProfileId: string, adminId: string) {
  const organizer = await prisma.organizerProfile.findUnique({
    where: { id: organizerProfileId },
  });
  if (!organizer) return { error: "not_found" as const };

  const updated = await prisma.user.update({
    where: { id: organizer.userId },
    data: { kycStatus: "approved" },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "approved_organizer",
      targetType: "OrganizerProfile",
      targetId: organizerProfileId,
    },
  });

  return { data: updated };
}

export async function rejectOrganizer(
  organizerProfileId: string,
  adminId: string,
  reason?: string
) {
  const organizer = await prisma.organizerProfile.findUnique({
    where: { id: organizerProfileId },
  });
  if (!organizer) return { error: "not_found" as const };

  const updated = await prisma.user.update({
    where: { id: organizer.userId },
    data: { kycStatus: "rejected" },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "rejected_organizer",
      targetType: "OrganizerProfile",
      targetId: organizerProfileId,
      notes: reason,
    },
  });

  return { data: updated };
}

export async function listPendingGameRequests() {
  return prisma.gameRequest.findMany({
    where: { status: "pending" },
    include: { organizer: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function approveGameRequest(gameRequestId: string, adminId: string) {
  const request = await prisma.gameRequest.findUnique({ where: { id: gameRequestId } });
  if (!request) return { error: "not_found" as const };
  if (request.status !== "pending") return { error: "already_reviewed" as const };

  const game = await prisma.game.create({
    data: { name: request.gameName },
  });

  const updated = await prisma.gameRequest.update({
    where: { id: gameRequestId },
    data: { status: "approved", approvedGameId: game.id },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "approved_game_request",
      targetType: "GameRequest",
      targetId: gameRequestId,
    },
  });

  return { data: updated };
}

export async function rejectGameRequest(gameRequestId: string, adminId: string, reason?: string) {
  const request = await prisma.gameRequest.findUnique({ where: { id: gameRequestId } });
  if (!request) return { error: "not_found" as const };
  if (request.status !== "pending") return { error: "already_reviewed" as const };

  const updated = await prisma.gameRequest.update({
    where: { id: gameRequestId },
    data: { status: "rejected" },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "rejected_game_request",
      targetType: "GameRequest",
      targetId: gameRequestId,
      notes: reason,
    },
  });

  return { data: updated };
}

// ------------------------------------------------------------
// TOURNAMENT EDIT / CANCEL
// ------------------------------------------------------------

export interface UpdateTournamentInput {
  name?: string;
  description?: string;
  bannerUrl?: string;
  maxTeams?: number;
  playersPerRoom?: number;
  entryFeeAmount?: number;
  entryFeeCurrency?: string;
  paymentInstructions?: string;
  prizePoolAmount?: number;
  prizePoolCurrency?: string;
  startAt?: Date;
}

export async function updateTournament(
  tournamentId: string,
  organizerId: string,
  input: UpdateTournamentInput
) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };
  if (tournament.organizerId !== organizerId) return { error: "forbidden" as const };

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: input,
  });
  return { data: updated };
}

export async function cancelTournament(tournamentId: string, organizerId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };
  if (tournament.organizerId !== organizerId) return { error: "forbidden" as const };
  if (tournament.status === "cancelled" || tournament.status === "completed") {
    return { error: "invalid_status" as const };
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "cancelled" },
  });

  // Phase 1 has no automated refund engine (that's Phase 7) — cancelling
  // just changes status. Paid registrations still show paymentStatus:
  // "paid" so the organizer can see who needs a manual refund by looking
  // at this tournament's registration list.

  return { data: updated };
}

// ------------------------------------------------------------
// PLAYER PROFILE
// ------------------------------------------------------------

export async function getPlayerProfileByUserId(userId: string) {
  return prisma.playerProfile.findUnique({
    where: { userId },
    include: { user: { select: { displayName: true, avatarUrl: true, email: true } } },
  });
}

export async function getPublicPlayerProfile(playerId: string) {
  return prisma.playerProfile.findUnique({
    where: { id: playerId },
    include: {
      user: { select: { displayName: true, avatarUrl: true } },
      _count: { select: { registrations: true } },
    },
  });
}

export interface UpdatePlayerProfileInput {
  firstName: string; // required
  lastName: string; // required
  avatarUrl?: string;
  mobileNumber?: string;
  region?: string;
  country?: string;
  city?: string;
  age?: number;
  gender?: string;
  hobbies?: string;
  favoriteGames?: string[];
}

export async function updatePlayerProfile(userId: string, input: UpdatePlayerProfileInput) {
  if (!input.firstName?.trim() || !input.lastName?.trim()) {
    return { error: "validation_error" as const, message: "First and last name are required." };
  }

  const displayName = `${input.firstName.trim()} ${input.lastName.trim()}`;

  const [user, playerProfile] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        displayName, // kept in sync — Nav, admin views, etc. already read this
        ...(input.avatarUrl && { avatarUrl: input.avatarUrl }),
      },
    }),
    prisma.playerProfile.update({
      where: { userId },
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        mobileNumber: input.mobileNumber || null,
        region: input.region || null,
        country: input.country || null,
        city: input.city || null,
        age: input.age ?? null,
        gender: input.gender || null,
        hobbies: input.hobbies || null,
        favoriteGames: input.favoriteGames ?? [],
      },
    }),
  ]);

  return { data: { user, playerProfile } };
}

// ------------------------------------------------------------
// ORGANIZER PROFILE
// ------------------------------------------------------------

export async function getOrganizerByUserId(userId: string) {
  return prisma.organizerProfile.findUnique({
    where: { userId },
    include: { user: { select: { kycStatus: true, displayName: true } } },
  });
}

export async function getPublicOrganizerProfile(organizerId: string) {
  const organizer = await prisma.organizerProfile.findUnique({
    where: { id: organizerId },
    include: {
      user: { select: { kycStatus: true } },
      _count: { select: { tournaments: true } },
    },
  });
  if (!organizer) return null;

  const completedTournaments = await prisma.tournament.findMany({
    where: { organizerId, status: "completed" },
    select: { prizePoolAmount: true, prizePoolCurrency: true },
  });

  return { ...organizer, completedTournaments };
}

export async function updateOrganizerProfile(
  organizerId: string,
  userId: string,
  input: { orgName?: string; bio?: string; socialLinks?: unknown }
) {
  const organizer = await prisma.organizerProfile.findUnique({ where: { id: organizerId } });
  if (!organizer) return { error: "not_found" as const };
  if (organizer.userId !== userId) return { error: "forbidden" as const };

  const updated = await prisma.organizerProfile.update({
    where: { id: organizerId },
    data: {
      ...(input.orgName && { orgName: input.orgName }),
      ...(input.bio !== undefined && { bio: input.bio }),
      ...(input.socialLinks !== undefined && { socialLinks: input.socialLinks as Prisma.InputJsonValue }),
    },
  });
  return { data: updated };
}

export async function getMyGameRequests(organizerId: string) {
  return prisma.gameRequest.findMany({
    where: { organizerId },
    orderBy: { createdAt: "desc" },
  });
}

// ------------------------------------------------------------
// REGISTRATION DETAIL / DISQUALIFY
// ------------------------------------------------------------

export async function getRegistrationById(
  registrationId: string,
  requesterUserId: string
) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      tournament: { include: { organizer: true } },
      player: { include: { user: { select: { displayName: true } } } },
      teamEntry: { include: { members: true } },
    },
  });
  if (!registration) return { error: "not_found" as const };

  // Access control: only the organizer who owns the tournament, or the
  // player who owns the registration, can view it.
  const isOwningOrganizer = registration.tournament.organizer.userId === requesterUserId;

  const player = await prisma.playerProfile.findUnique({ where: { userId: requesterUserId } });
  const isOwningPlayer = player?.id === registration.playerId;

  if (!isOwningOrganizer && !isOwningPlayer) {
    return { error: "forbidden" as const };
  }

  return { data: registration };
}

export async function disqualifyRegistration(
  registrationId: string,
  organizerId: string,
  reason: string,
  ruleId?: string
) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: true },
  });
  if (!registration) return { error: "not_found" as const };
  if (registration.tournament.organizerId !== organizerId) return { error: "forbidden" as const };

  const updated = await prisma.registration.update({
    where: { id: registrationId },
    data: {
      status: "disqualified",
      disqualifiedReason: reason,
      disqualifiedRuleId: ruleId,
    },
  });
  return { data: updated };
}

// ------------------------------------------------------------
// MODERATION — lightweight flag/report stub
// ------------------------------------------------------------

export async function flagTournament(tournamentId: string, reporterId: string, reason: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };

  const flag = await prisma.tournamentFlag.create({
    data: { tournamentId, reporterId, reason },
  });
  return { data: flag };
}

export async function listFlaggedTournaments() {
  return prisma.tournament.findMany({
    where: { flags: { some: { resolved: false } } },
    include: {
      organizer: true,
      flags: { where: { resolved: false }, orderBy: { createdAt: "desc" } },
    },
  });
}

// ------------------------------------------------------------
// STATUS TRANSITIONS
// ------------------------------------------------------------

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  published: ["registration_open", "registration_closed", "in_progress"],
  registration_open: ["registration_closed", "in_progress"],
  registration_closed: ["in_progress"],
  in_progress: ["completed"],
};

export async function updateTournamentStatus(
  tournamentId: string,
  organizerId: string,
  newStatus: string
) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };
  if (tournament.organizerId !== organizerId) return { error: "forbidden" as const };

  const allowed = ALLOWED_STATUS_TRANSITIONS[tournament.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return { error: "invalid_transition" as const, allowed };
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: newStatus as TournamentStatus },
  });

  return { data: updated };
}

export async function resolveFlag(flagId: string, adminId: string) {
  const flag = await prisma.tournamentFlag.findUnique({ where: { id: flagId } });
  if (!flag) return { error: "not_found" as const };

  const updated = await prisma.tournamentFlag.update({
    where: { id: flagId },
    data: { resolved: true },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "resolved_flag",
      targetType: "TournamentFlag",
      targetId: flagId,
    },
  });

  return { data: updated };
}

// ------------------------------------------------------------
// MANUAL ADD — organizer adds a player directly, bypassing self-registration
// ------------------------------------------------------------

export async function manualAddRegistration(
  tournamentId: string,
  organizerId: string,
  playerEmail: string,
  paymentStatus: "paid" | "waived" = "waived"
) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };
  if (tournament.organizerId !== organizerId) return { error: "forbidden" as const };

  const userRecord = await prisma.user.findUnique({ where: { email: playerEmail } });
  if (!userRecord) return { error: "player_not_found" as const };

  let playerProfile = await prisma.playerProfile.findUnique({
    where: { userId: userRecord.id },
  });
  if (!playerProfile) {
    playerProfile = await prisma.playerProfile.create({ data: { userId: userRecord.id } });
  }

  const existing = await prisma.registration.findFirst({
    where: { tournamentId, playerId: playerProfile.id },
  });
  if (existing) return { error: "already_registered" as const };

  // Organizer-added registrations skip the pending queue — the organizer
  // is directly vouching for this player, so it's approved immediately.
  const registration = await prisma.registration.create({
    data: {
      tournamentId,
      playerId: playerProfile.id,
      status: "approved",
      approvedAt: new Date(),
      addedBy: "organizer",
      paymentStatus,
    },
  });

  return { data: registration };
}

export async function listOrganizers() {
  return prisma.organizerProfile.findMany({
    include: {
      user: { select: { kycStatus: true } },
      _count: { select: { tournaments: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ------------------------------------------------------------
// RESULTS / STANDINGS
// ------------------------------------------------------------

export async function setRegistrationResult(
  registrationId: string,
  organizerId: string,
  placement?: number,
  points?: number
) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: true },
  });
  if (!registration) return { error: "not_found" as const };
  if (registration.tournament.organizerId !== organizerId) return { error: "forbidden" as const };

  const updated = await prisma.registration.update({
    where: { id: registrationId },
    data: {
      placement: placement ?? null,
      points: points ?? null,
    },
  });

  return { data: updated };
}

// Public standings — anyone can view, sorted by placement (nulls last),
// then by points (highest first) as a tiebreaker/fallback for tournaments
// that rank by points rather than a single final placement.
export async function getStandings(tournamentId: string) {
  const registrations = await prisma.registration.findMany({
    where: {
      tournamentId,
      status: "approved",
      OR: [{ placement: { not: null } }, { points: { not: null } }],
    },
    include: {
      player: { include: { user: { select: { displayName: true } } } },
      teamEntry: true,
    },
  });

  return registrations.sort((a, b) => {
    if (a.placement != null && b.placement != null) return a.placement - b.placement;
    if (a.placement != null) return -1;
    if (b.placement != null) return 1;
    return (b.points ?? 0) - (a.points ?? 0);
  });
}
export async function getSiteSettings() {
  return prisma.siteSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function updateSiteSettings(logoUrl: string) {
  return prisma.siteSettings.upsert({
    where: { id: "singleton" },
    update: { logoUrl },
    create: { id: "singleton", logoUrl },
  });
}

export async function listCarouselSlides() {
  return prisma.authCarouselSlide.findMany({ orderBy: { order: "asc" } });
}

export async function createCarouselSlide(input: {
  mediaUrl: string;
  mediaType: "image" | "video";
  title?: string;
  text?: string;
  order?: number;
}) {
  const count = await prisma.authCarouselSlide.count();
  return prisma.authCarouselSlide.create({
    data: {
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType,
      title: input.title,
      text: input.text,
      order: input.order ?? count,
    },
  });
}

export async function deleteCarouselSlide(id: string) {
  return prisma.authCarouselSlide.delete({ where: { id } });
}