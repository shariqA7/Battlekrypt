// Shared service layer for tournament reads/writes.
//
// Both the /api route handlers (the contract mobile will eventually consume)
// and the Next.js Server Components (web pages) call these same functions —
// the web app avoids a wasteful self-fetch over HTTP, while the exposed
// route handlers give mobile/external clients the identical logic.
// Business rules live here ONCE, not duplicated between a page and a route.

import { prisma } from "@/lib/prisma";
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

export async function getTournamentById(id: string) {
  return prisma.tournament.findUnique({
    where: { id },
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
  prizePoolAmount?: number;
  prizePoolCurrency?: string;
  customFields?: unknown;
  rules?: string[]; // Phase 1: free-text rules
  startAt?: Date;
}

export async function createTournament(input: CreateTournamentInput) {
  return prisma.tournament.create({
    data: {
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

  // Prevent a player registering twice for the same tournament
  const existing = await prisma.registration.findFirst({
    where: { tournamentId: input.tournamentId, playerId: input.playerId },
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
