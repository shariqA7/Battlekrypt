import { prisma } from "@/lib/prisma";
import type { CheckInStatus, VenueType } from "@prisma/client";
import { checkInWindowError, generateCheckInCode } from "@/lib/services/venue";

// Hybrid tournaments (Phase 8.4, spec §8): the venue is decided PER STAGE —
// e.g. online qualifiers, LAN finals — and the organizer advances entries
// from one stage into the next. Only advanced entries can use a restricted
// stage's room or check in at its venue.

type Result<T> = { data: T } | { error: string; message?: string };
const MAX_CODE_ATTEMPTS = 5;

export function stageVenueIsComplete(s: {
  venueType: VenueType;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
}) {
  if (s.venueType !== "lan") return true;
  return !!(s.venueName?.trim() && s.venueAddress?.trim() && s.venueCity?.trim());
}

// What publishing a hybrid tournament needs: at least one online and one LAN
// stage (otherwise it should just be Online or LAN), every LAN stage complete.
export function hybridStagesError(
  stages: { venueType: VenueType; venueName: string | null; venueAddress: string | null; venueCity: string | null }[]
): string | null {
  const lan = stages.filter((s) => s.venueType === "lan");
  const online = stages.filter((s) => s.venueType === "online");
  if (lan.length === 0 || online.length === 0) {
    return "A hybrid tournament needs at least one online stage and one LAN stage. Add stages, or switch the tournament to Online or LAN.";
  }
  if (!lan.every(stageVenueIsComplete)) {
    return "Add the venue name, address and city to every LAN stage before publishing.";
  }
  return null;
}

type OwnedStage =
  | { ok: true; stage: NonNullable<Awaited<ReturnType<typeof loadStage>>> }
  | { ok: false; error: string; message?: string };

function loadStage(stageId: string) {
  return prisma.stage.findUnique({ where: { id: stageId }, include: { tournament: true } });
}

async function ownedStage(stageId: string, organizerId: string): Promise<OwnedStage> {
  const stage = await loadStage(stageId);
  if (!stage) return { ok: false, error: "not_found" };
  if (stage.tournament.organizerId !== organizerId) return { ok: false, error: "forbidden" };
  if (["completed", "cancelled"].includes(stage.tournament.status)) {
    return { ok: false, error: "closed", message: "This tournament is over." };
  }
  return { ok: true, stage };
}

export interface StageVenueInput {
  venueType?: VenueType;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  checkInOpensAt?: Date | null;
  checkInClosesAt?: Date | null;
  restricted?: boolean;
}

export async function updateStageVenue(stageId: string, organizerId: string, input: StageVenueInput): Promise<Result<{ id: string }>> {
  const o = await ownedStage(stageId, organizerId);
  if (!o.ok) return { error: o.error, message: o.message };
  const { stage } = o;

  if (stage.tournament.venueType !== "hybrid") {
    return {
      error: "not_hybrid",
      message: "Venues are set per stage only on hybrid tournaments. Change the tournament to Hybrid first.",
    };
  }
  if (input.venueType === "hybrid") return { error: "validation", message: "A stage is either online or LAN." };

  const type = input.venueType ?? stage.venueType;

  // Don't change a stage's venue type after people have already checked in.
  if (input.venueType && input.venueType !== stage.venueType) {
    const done = await prisma.stageEntry.count({ where: { stageId, checkInStatus: { not: "pending" } } });
    if (done > 0) return { error: "stage_locked", message: "Players have already checked in to this stage." };
  }

  if (type === "lan") {
    const opens = input.checkInOpensAt !== undefined ? input.checkInOpensAt : stage.checkInOpensAt;
    const closes = input.checkInClosesAt !== undefined ? input.checkInClosesAt : stage.checkInClosesAt;
    const windowError = checkInWindowError(opens, closes);
    if (windowError) return { error: "validation", message: windowError };
    await prisma.stage.update({
      where: { id: stageId },
      data: {
        venueType: "lan",
        ...(input.venueName !== undefined && { venueName: input.venueName }),
        ...(input.venueAddress !== undefined && { venueAddress: input.venueAddress }),
        ...(input.venueCity !== undefined && { venueCity: input.venueCity }),
        ...(input.checkInOpensAt !== undefined && { checkInOpensAt: input.checkInOpensAt }),
        ...(input.checkInClosesAt !== undefined && { checkInClosesAt: input.checkInClosesAt }),
        checkInCode: stage.checkInCode ?? generateCheckInCode(),
        restricted: true, // a LAN stage only holds the entries that advanced
        // no room credentials on a LAN stage
        roomId: null,
        roomPassword: null,
        roomRevealAt: null,
      },
    });
  } else {
    await prisma.stage.update({
      where: { id: stageId },
      data: {
        venueType: "online",
        venueName: null,
        venueAddress: null,
        venueCity: null,
        checkInOpensAt: null,
        checkInClosesAt: null,
        checkInCode: null,
        ...(input.restricted !== undefined && { restricted: input.restricted }),
        // coming back from LAN: the stage was forced restricted, keep it unless told otherwise
      },
    });
  }
  return { data: { id: stageId } };
}

// ---------------- advancement ----------------

// Advance explicit registrations, or the top N by points (ties: better
// placement first). Only approved entries advance; already-advanced ones are
// skipped. Returns how many were newly added.
export async function advanceToStage(
  stageId: string,
  organizerId: string,
  pick: { registrationIds?: string[]; top?: number }
): Promise<Result<{ added: number }>> {
  const o = await ownedStage(stageId, organizerId);
  if (!o.ok) return { error: o.error, message: o.message };
  const { stage } = o;

  let ids: string[] = [];
  if (pick.registrationIds?.length) {
    const regs = await prisma.registration.findMany({
      where: { id: { in: pick.registrationIds }, tournamentId: stage.tournamentId, status: "approved" },
      select: { id: true },
    });
    ids = regs.map((r) => r.id);
    if (ids.length !== new Set(pick.registrationIds).size) {
      return { error: "invalid_entries", message: "Only approved entries of this tournament can advance." };
    }
  } else if (pick.top && pick.top > 0) {
    const regs = await prisma.registration.findMany({
      where: { tournamentId: stage.tournamentId, status: "approved" },
      orderBy: [{ points: { sort: "desc", nulls: "last" } }, { placement: { sort: "asc", nulls: "last" } }, { registeredAt: "asc" }],
      take: Math.min(pick.top, 500),
      select: { id: true },
    });
    ids = regs.map((r) => r.id);
  } else {
    return { error: "validation", message: "Choose entries to advance, or a top-N count." };
  }

  const res = await prisma.stageEntry.createMany({
    data: ids.map((registrationId) => ({ stageId, registrationId })),
    skipDuplicates: true,
  });
  return { data: { added: res.count } };
}

export async function removeFromStage(stageId: string, organizerId: string, registrationId: string): Promise<Result<{ removed: boolean }>> {
  const o = await ownedStage(stageId, organizerId);
  if (!o.ok) return { error: o.error, message: o.message };
  const res = await prisma.stageEntry.deleteMany({ where: { stageId, registrationId } });
  return { data: { removed: res.count > 0 } };
}

export async function listStageEntries(tournamentId: string) {
  return prisma.stageEntry.findMany({
    where: { stage: { tournamentId } },
    select: { id: true, stageId: true, registrationId: true, checkInStatus: true },
  });
}

// ---------------- check-in (per stage) ----------------

async function findMyStageEntry(stageId: string, tournamentId: string, playerId: string) {
  return prisma.stageEntry.findFirst({
    where: {
      stageId,
      registration: {
        tournamentId,
        status: "approved",
        OR: [{ playerId }, { teamEntry: { members: { some: { playerId } } } }],
      },
    },
  });
}

// null = nothing to show (not an approved entrant, or not a LAN stage of a
// hybrid tournament). advanced:false = approved but not through to this stage.
export async function getMyStageCheckIn(stageId: string, playerId: string) {
  const stage = await prisma.stage.findUnique({ where: { id: stageId }, include: { tournament: true } });
  if (!stage || stage.tournament.venueType !== "hybrid" || stage.venueType !== "lan") return null;
  const approved = await prisma.registration.findFirst({
    where: {
      tournamentId: stage.tournamentId,
      status: "approved",
      OR: [{ playerId }, { teamEntry: { members: { some: { playerId } } } }],
    },
    select: { id: true },
  });
  if (!approved) return null;
  const entry = await findMyStageEntry(stageId, stage.tournamentId, playerId);
  if (!entry) return { advanced: false as const };
  return {
    advanced: true as const,
    status: entry.checkInStatus,
    opensAt: stage.checkInOpensAt,
    closesAt: stage.checkInClosesAt,
    locked: entry.checkInAttempts >= MAX_CODE_ATTEMPTS,
  };
}

export async function stageSelfCheckIn(stageId: string, playerId: string, code: string): Promise<Result<{ status: CheckInStatus }>> {
  const stage = await prisma.stage.findUnique({ where: { id: stageId }, include: { tournament: true } });
  if (!stage) return { error: "not_found" };
  if (stage.tournament.venueType !== "hybrid" || stage.venueType !== "lan") {
    return { error: "not_lan", message: "This stage has no on-site check-in." };
  }
  if (["completed", "cancelled"].includes(stage.tournament.status)) return { error: "closed", message: "This tournament is over." };

  const entry = await findMyStageEntry(stageId, stage.tournamentId, playerId);
  if (!entry) return { error: "not_advanced", message: "Your entry hasn't advanced to this stage." };
  if (entry.checkInStatus === "checked_in") return { data: { status: "checked_in" } };

  const now = new Date();
  if (stage.checkInOpensAt && now < stage.checkInOpensAt) return { error: "not_open", message: "Check-in hasn't opened yet." };
  if (stage.checkInClosesAt && now > stage.checkInClosesAt) {
    return { error: "window_closed", message: "Check-in has closed. Ask the organizer to check you in." };
  }
  if (entry.checkInAttempts >= MAX_CODE_ATTEMPTS) {
    return { error: "locked", message: "Too many wrong codes. Ask the organizer to check you in." };
  }
  if (!stage.checkInCode || code.trim().toUpperCase() !== stage.checkInCode) {
    await prisma.stageEntry.update({ where: { id: entry.id }, data: { checkInAttempts: { increment: 1 } } });
    return { error: "wrong_code", message: "That code isn't right." };
  }
  await prisma.stageEntry.update({ where: { id: entry.id }, data: { checkInStatus: "checked_in", checkedInAt: now } });
  return { data: { status: "checked_in" } };
}

export async function setStageEntryCheckIn(entryId: string, organizerId: string, status: CheckInStatus): Promise<Result<{ status: CheckInStatus }>> {
  const entry = await prisma.stageEntry.findUnique({
    where: { id: entryId },
    include: { stage: { include: { tournament: true } }, registration: true },
  });
  if (!entry) return { error: "not_found" };
  if (entry.stage.tournament.organizerId !== organizerId) return { error: "forbidden" };
  if (entry.stage.venueType !== "lan" || entry.stage.tournament.venueType !== "hybrid") {
    return { error: "not_lan", message: "This stage has no on-site check-in." };
  }
  if (entry.registration.status !== "approved") return { error: "not_approved", message: "Only approved entries can check in." };
  if (["completed", "cancelled"].includes(entry.stage.tournament.status)) return { error: "closed", message: "This tournament is over." };

  await prisma.stageEntry.update({
    where: { id: entryId },
    data: { checkInStatus: status, checkedInAt: status === "checked_in" ? new Date() : null, checkInAttempts: 0 },
  });
  return { data: { status } };
}

export async function stageCheckInCounts(stageId: string) {
  const groups = await prisma.stageEntry.groupBy({ by: ["checkInStatus"], where: { stageId, registration: { status: "approved" } }, _count: true });
  const n = (s: string) => groups.find((g) => g.checkInStatus === s)?._count ?? 0;
  return { checkedIn: n("checked_in"), noShow: n("no_show"), pending: n("pending") };
}
