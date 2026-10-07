import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import type { CheckInStatus, VenueType } from "@prisma/client";

// ------------------------------------------------------------
// Venue details (Phase 8.3, spec §8)
// ------------------------------------------------------------

export interface VenueInput {
  venueType?: VenueType;
  venueName?: string | null;
  venueAddress?: string | null;
  venueCity?: string | null;
  checkInOpensAt?: Date | null;
  checkInClosesAt?: Date | null;
}

// A LAN tournament can't go public without somewhere to show up.
export function venueIsComplete(t: {
  venueType: VenueType;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
}) {
  if (t.venueType !== "lan") return true;
  return !!(t.venueName?.trim() && t.venueAddress?.trim() && t.venueCity?.trim());
}

export function checkInWindowError(opens?: Date | null, closes?: Date | null): string | null {
  if (opens && closes && closes <= opens) return "Check-in must close after it opens.";
  return null;
}

// No 0/O/1/I so a code read out loud or off a screen isn't misheard.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateCheckInCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return out;
}

// What the public (and the join page's client component) may see. The check-in
// code is the on-site secret, and room credentials are time-gated — they only
// come out of /api/stages/:id/room, never from the tournament payload.
export function toPublicTournament<
  T extends {
    checkInCode?: string | null;
    stages?: { roomId: string | null; roomPassword: string | null; roomRevealAt: Date | null; checkInCode?: string | null }[];
  },
>(t: T) {
  const { checkInCode: _code, ...rest } = t;
  void _code;
  return {
    ...rest,
    stages: (t.stages ?? []).map((s) => {
      const { roomId, roomPassword: _pw, roomRevealAt: _at, checkInCode: _sc, ...stage } = s as typeof s & Record<string, unknown>;
      void _pw;
      void _at;
      void _sc;
      return { ...stage, hasRoom: !!roomId };
    }),
  } as Omit<T, "checkInCode" | "stages"> & {
    stages: (Omit<NonNullable<T["stages"]>[number], "roomId" | "roomPassword" | "roomRevealAt" | "checkInCode"> & {
      hasRoom: boolean;
    })[];
  };
}

// ------------------------------------------------------------
// Check-in
// ------------------------------------------------------------

type Result<T> = { data: T } | { error: string; message?: string };
const MAX_CODE_ATTEMPTS = 5;

async function findMyRegistration(tournamentId: string, playerId: string) {
  return prisma.registration.findFirst({
    where: {
      tournamentId,
      status: "approved",
      OR: [{ playerId }, { teamEntry: { members: { some: { playerId } } } }],
    },
  });
}

export async function getMyCheckIn(tournamentId: string, playerId: string) {
  const [t, reg] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { venueType: true, checkInOpensAt: true, checkInClosesAt: true },
    }),
    findMyRegistration(tournamentId, playerId),
  ]);
  if (!t || t.venueType !== "lan" || !reg) return null;
  return {
    status: reg.checkInStatus,
    checkedInAt: reg.checkedInAt,
    opensAt: t.checkInOpensAt,
    closesAt: t.checkInClosesAt,
    locked: reg.checkInAttempts >= MAX_CODE_ATTEMPTS,
  };
}

// Player checks themselves (their team) in by typing the code shown at the
// venue. The code is what proves they're physically there.
export async function selfCheckIn(
  tournamentId: string,
  playerId: string,
  code: string
): Promise<Result<{ status: CheckInStatus }>> {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) return { error: "not_found" };
  if (t.venueType !== "lan") return { error: "not_lan", message: "This tournament has no on-site check-in." };
  if (["completed", "cancelled"].includes(t.status)) return { error: "closed", message: "This tournament is over." };

  const reg = await findMyRegistration(tournamentId, playerId);
  if (!reg) return { error: "not_registered", message: "You're not approved for this tournament." };
  if (reg.checkInStatus === "checked_in") return { data: { status: "checked_in" } };

  const now = new Date();
  if (t.checkInOpensAt && now < t.checkInOpensAt) {
    return { error: "not_open", message: "Check-in hasn't opened yet." };
  }
  if (t.checkInClosesAt && now > t.checkInClosesAt) {
    return { error: "window_closed", message: "Check-in has closed. Ask the organizer to check you in." };
  }
  if (reg.checkInAttempts >= MAX_CODE_ATTEMPTS) {
    return { error: "locked", message: "Too many wrong codes. Ask the organizer to check you in." };
  }

  const given = code.trim().toUpperCase();
  if (!t.checkInCode || given !== t.checkInCode) {
    await prisma.registration.update({
      where: { id: reg.id },
      data: { checkInAttempts: { increment: 1 } },
    });
    return { error: "wrong_code", message: "That code isn't right." };
  }

  await prisma.registration.update({
    where: { id: reg.id },
    data: { checkInStatus: "checked_in", checkedInAt: now },
  });
  return { data: { status: "checked_in" } };
}

// Organizer marks an approved entry Checked-in / No-show, or undoes it.
// Works any time the tournament is still running, regardless of the player
// window — the organizer is the one standing at the desk.
export async function setCheckInStatus(
  registrationId: string,
  organizerId: string,
  status: CheckInStatus
): Promise<Result<{ status: CheckInStatus }>> {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: true },
  });
  if (!reg) return { error: "not_found" };
  if (reg.tournament.organizerId !== organizerId) return { error: "forbidden" };
  if (reg.tournament.venueType !== "lan") return { error: "not_lan", message: "This tournament has no on-site check-in." };
  if (reg.status !== "approved") return { error: "not_approved", message: "Only approved entries can check in." };
  if (["completed", "cancelled"].includes(reg.tournament.status)) {
    return { error: "closed", message: "This tournament is over." };
  }

  await prisma.registration.update({
    where: { id: registrationId },
    data: {
      checkInStatus: status,
      checkedInAt: status === "checked_in" ? new Date() : null,
      // An organizer decision also clears a self-check-in lockout.
      checkInAttempts: 0,
    },
  });
  return { data: { status } };
}

export async function checkInCounts(tournamentId: string) {
  const groups = await prisma.registration.groupBy({
    by: ["checkInStatus"],
    where: { tournamentId, status: "approved" },
    _count: true,
  });
  const n = (s: string) => groups.find((g) => g.checkInStatus === s)?._count ?? 0;
  return { checkedIn: n("checked_in"), noShow: n("no_show"), pending: n("pending") };
}
