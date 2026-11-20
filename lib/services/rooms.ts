// Rooms, seat counting and the waiting list, against the database.
//
// Why a lock: "count the entries, then add one" is two steps. When 30 teams press Join on a
// 25-seat room in the same second, every one of them can see "24 taken" and all get in. So every
// change that takes or frees a seat runs inside a transaction that first takes ONE lock per
// tournament (pg_advisory_xact_lock). Teams are then handled strictly one at a time, and the 26th
// sees "25 taken" for certain. The lock is held only for those few queries, and other tournaments
// are never held up.
import { prisma } from "@/lib/prisma";
import { notifyMany } from "@/lib/services/notifications";
import {
  buildRooms, decidePlacement, inPlayOrder, payDeadline, planPromotions, queuePosition, roomLabel, roomPlanError,
  seatsLeft, totalSeats, type Placement, type RoomPlan, type RoomSeat, type Waiting,
} from "@/lib/rooms";
import { resolveResales } from "@/lib/refunds";
import type { EntryType, Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;
type Tx = Prisma.TransactionClient;

/** The statuses that hold a seat. Waitlisted, withdrawn, rejected and disqualified entries do not. */
export const SEAT_HOLDING = ["pending", "approved"] as const;

export interface SeatTournament {
  id: string;
  slug?: string;
  name?: string;
  maxTeams: number;
  startAt: Date | null;
  entryType: EntryType;
  waitlistEnabled: boolean;
  payWindowMinutes: number;
}

export const SEAT_TOURNAMENT_SELECT = {
  id: true, slug: true, name: true, maxTeams: true, startAt: true, entryType: true, waitlistEnabled: true, payWindowMinutes: true,
} as const;

/** One lock per tournament, released when the transaction ends. */
export async function lockSeats(tx: Tx, tournamentId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`seats:${tournamentId}`}, 0))`;
}

export interface SeatState {
  rooms: RoomSeat[];
  takenWithoutRoom: number; // seat-holding entries not in any room (the single pool, or a manual add)
  takenTotal: number;
  waiting: Waiting[];
}

export async function loadSeatState(db: Db, tournamentId: string): Promise<SeatState> {
  const [rooms, held, waiting] = await Promise.all([
    db.tournamentRoom.findMany({ where: { tournamentId }, orderBy: [{ number: "asc" }] }),
    db.registration.groupBy({ by: ["roomId"], where: { tournamentId, status: { in: [...SEAT_HOLDING] } }, _count: { _all: true } }),
    db.registration.findMany({
      where: { tournamentId, status: "waitlisted" },
      select: { id: true, waitlistedAt: true, registeredAt: true },
    }),
  ]);
  const takenBy = new Map(held.map((h) => [h.roomId, h._count._all]));
  return {
    rooms: rooms.map((r) => ({ id: r.id, number: r.number, name: r.name, startAt: r.startAt, capacity: r.capacity, taken: takenBy.get(r.id) ?? 0 })),
    takenWithoutRoom: takenBy.get(null) ?? 0,
    takenTotal: held.reduce((s, h) => s + h._count._all, 0),
    waiting: waiting.map((w) => ({ id: w.id, waitlistedAt: w.waitlistedAt ?? w.registeredAt })),
  };
}

// ---- who to tell ------------------------------------------------------------------------------

/** Everyone on an entry: the solo player, every team member, and whoever paid. */
export async function entryUserIds(registrationIds: string[]): Promise<Map<string, string[]>> {
  if (registrationIds.length === 0) return new Map();
  const rows = await prisma.registration.findMany({
    where: { id: { in: registrationIds } },
    select: {
      id: true, payerUserId: true,
      player: { select: { userId: true } },
      teamEntry: { select: { members: { select: { player: { select: { userId: true } } } } } },
    },
  });
  return new Map(rows.map((r) => [r.id, [...new Set([
    ...(r.payerUserId ? [r.payerUserId] : []),
    ...(r.player ? [r.player.userId] : []),
    ...(r.teamEntry?.members.map((m) => m.player.userId) ?? []),
  ])]]));
}

async function tell(ids: string[], t: { slug?: string; name?: string }, n: { type: string; title: string; body: string }) {
  if (ids.length === 0) return;
  const map = await entryUserIds(ids);
  await notifyMany([...new Set([...map.values()].flat())], { ...n, href: t.slug ? `/tournaments/${t.slug}` : undefined });
}

// ---- releasing and promoting (inside a locked transaction) ------------------------------------

/**
 * A promoted or newly seated team on a PAID event that hasn't sent payment by its deadline loses the
 * seat. Returns the entries released so the caller can tell them.
 */
export async function releaseExpiredHolds(tx: Tx, t: SeatTournament, now = new Date()): Promise<string[]> {
  if (t.entryType !== "paid") return [];
  const late = await tx.registration.findMany({
    where: { tournamentId: t.id, status: "pending", paymentProofUrl: null, payDueAt: { lte: now } },
    select: { id: true },
  });
  if (late.length === 0) return [];
  await tx.registration.updateMany({
    where: { id: { in: late.map((l) => l.id) } },
    data: { status: "withdrawn", withdrawnAt: now, roomId: null, payDueAt: null, releaseReason: "payment_window_expired" },
  });
  return late.map((l) => l.id);
}

export interface Promoted {
  id: string;
  roomId: string | null;
  roomName: string | null;
  payDueAt: Date | null;
}

/** Give every free seat to the queue, first come, first served. */
export async function promoteWaitlist(tx: Tx, t: SeatTournament, now = new Date()): Promise<Promoted[]> {
  const s = await loadSeatState(tx, t.id);
  if (s.waiting.length === 0) return [];
  const plan = planPromotions({ rooms: s.rooms, tournamentStart: t.startAt, maxTeams: t.maxTeams, takenWithoutRoom: s.takenWithoutRoom, waiting: s.waiting });
  const out: Promoted[] = [];
  for (const p of plan) {
    const reg = await tx.registration.findUnique({ where: { id: p.registrationId }, select: { paymentProofUrl: true } });
    const owesPayment = t.entryType === "paid" && !reg?.paymentProofUrl;
    const payDueAt = owesPayment ? payDeadline(now, t.payWindowMinutes) : null;
    await tx.registration.update({
      where: { id: p.registrationId },
      data: { status: "pending", roomId: p.roomId, promotedAt: now, payDueAt },
    });
    const room = s.rooms.find((r) => r.id === p.roomId);
    out.push({ id: p.registrationId, roomId: p.roomId, roomName: room ? roomLabel(room) : null, payDueAt });
  }
  return out;
}

/**
 * Seats that were re-filled from the waiting list settle withdrawals waiting on a "refund if resold"
 * policy, oldest withdrawal first. Returns the entries that are now owed a refund.
 */
export async function settleResales(tx: Db, tournamentId: string, seatsResold: number): Promise<string[]> {
  if (seatsResold <= 0) return [];
  const waiting = await tx.registration.findMany({
    where: { tournamentId, refundStatus: "waiting_resale", withdrawnAt: { not: null } },
    select: { id: true, withdrawnAt: true },
  });
  const { owed } = resolveResales(waiting.map((w) => ({ id: w.id, withdrawnAt: w.withdrawnAt as Date })), seatsResold);
  if (owed.length > 0) await tx.registration.updateMany({ where: { id: { in: owed } }, data: { refundStatus: "owed", refundDecidedAt: new Date() } });
  return owed;
}

/**
 * Where does the next entry go? Call with the lock held. Expired holds are released and the queue is
 * promoted first, so a newcomer can never jump ahead of someone who has been waiting.
 */
export async function placeEntry(tx: Tx, t: SeatTournament, preferredRoomId?: string | null): Promise<Placement & { released: string[]; promoted: Promoted[]; resold: string[] }> {
  const released = await releaseExpiredHolds(tx, t);
  const promoted = await promoteWaitlist(tx, t);
  const resold = await settleResales(tx, t.id, promoted.length);
  const s = await loadSeatState(tx, t.id);
  const placement = decidePlacement({
    rooms: s.rooms, preferredRoomId, tournamentStart: t.startAt, maxTeams: t.maxTeams,
    takenWithoutRoom: s.takenWithoutRoom, waitlistEnabled: t.waitlistEnabled, waitingCount: s.waiting.length,
  });
  return { ...placement, released, promoted, resold };
}

/** The same decision without writing or locking: used to decide what to ask the player for. */
export async function previewPlacement(t: SeatTournament, preferredRoomId?: string | null): Promise<Placement> {
  const s = await loadSeatState(prisma, t.id);
  return decidePlacement({
    rooms: s.rooms, preferredRoomId, tournamentStart: t.startAt, maxTeams: t.maxTeams,
    takenWithoutRoom: s.takenWithoutRoom, waitlistEnabled: t.waitlistEnabled, waitingCount: s.waiting.length,
  });
}

/** Tell people what happened to their seats after a locked transaction has committed. */
export async function announceSeatChanges(t: SeatTournament, released: string[], promoted: Promoted[], resold: string[] = []) {
  try {
    await tell(released, t, {
      type: "seat_released",
      title: `Your seat in ${t.name ?? "the tournament"} was released`,
      body: "Payment didn't arrive in time, so the seat went to the next team in line. You can join the waiting list again if there is still room.",
    });
    for (const p of promoted) {
      const pay = p.payDueAt ? ` Send your payment within ${t.payWindowMinutes} minutes to keep it.` : "";
      await tell([p.id], t, {
        type: "seat_opened",
        title: `A seat opened in ${t.name ?? "the tournament"}`,
        body: `You're in${p.roomName ? ` ${p.roomName}` : ""}.${pay}`,
      });
    }
    await tell(resold, t, {
      type: "refund_owed",
      title: `Your refund for ${t.name ?? "the tournament"} is due`,
      body: "Another team took your seat from the waiting list, so the organizer now owes you a refund.",
    });
  } catch (e) {
    console.error("announceSeatChanges failed", e);
  }
}

/**
 * Re-check one tournament: release unpaid seats whose time is up, then fill every free seat from the
 * queue. Safe to call at any time and from anywhere (rejecting an entry, a withdrawal, a bigger room,
 * a page view); it does nothing when there is nothing to do. Never throws.
 */
export async function refreshSeats(tournamentId: string): Promise<{ promoted: number; released: number }> {
  try {
    // Nothing queued and no unpaid hold running out: nothing to do, so don't even take the lock.
    const work = await prisma.registration.count({
      where: { tournamentId, OR: [{ status: "waitlisted" }, { status: "pending", paymentProofUrl: null, payDueAt: { lte: new Date() } }] },
    });
    if (work === 0) return { promoted: 0, released: 0 };
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: SEAT_TOURNAMENT_SELECT });
    if (!t) return { promoted: 0, released: 0 };
    const result = await prisma.$transaction(async (tx) => {
      await lockSeats(tx, t.id);
      const released = await releaseExpiredHolds(tx, t);
      const promoted = await promoteWaitlist(tx, t);
      const resold = await settleResales(tx, t.id, promoted.length);
      return { released, promoted, resold };
    });
    if (result.released.length || result.promoted.length) await announceSeatChanges(t, result.released, result.promoted, result.resold);
    return { promoted: result.promoted.length, released: result.released.length };
  } catch (e) {
    console.error("refreshSeats failed", e);
    return { promoted: 0, released: 0 };
  }
}

// ---- reading ----------------------------------------------------------------------------------

export interface SeatSummary {
  hasRooms: boolean;
  rooms: (RoomSeat & { label: string; seatsLeft: number })[];
  totalSeats: number;
  taken: number;
  seatsLeft: number;
  waiting: number;
  waitlistEnabled: boolean;
}

export async function getSeatSummary(tournamentId: string): Promise<SeatSummary | null> {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: SEAT_TOURNAMENT_SELECT });
  if (!t) return null;
  const s = await loadSeatState(prisma, t.id);
  const total = totalSeats(s.rooms, t.maxTeams);
  const rooms = inPlayOrder(s.rooms, t.startAt).map((r) => ({ ...r, label: roomLabel(r), seatsLeft: seatsLeft(r) }));
  const inRooms = s.rooms.length > 0 ? s.rooms.reduce((n, r) => n + r.taken, 0) : s.takenTotal;
  return {
    hasRooms: s.rooms.length > 0, rooms, totalSeats: total, taken: inRooms,
    seatsLeft: Math.max(0, total - inRooms), waiting: s.waiting.length, waitlistEnabled: t.waitlistEnabled,
  };
}

/** Where an entry stands: seated (and where), or queued (and at what place). */
export async function getEntryPlacement(registrationId: string) {
  const r = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: { id: true, tournamentId: true, status: true, roomId: true, waitlistedAt: true, registeredAt: true, payDueAt: true, paymentProofUrl: true, room: true, refundStatus: true, withdrawnAt: true, releaseReason: true },
  });
  if (!r) return null;
  let position: number | null = null;
  let waitingTotal = 0;
  if (r.status === "waitlisted") {
    const s = await loadSeatState(prisma, r.tournamentId);
    position = queuePosition(s.waiting, r.id);
    waitingTotal = s.waiting.length;
  }
  return {
    status: r.status,
    room: r.room ? { id: r.room.id, number: r.room.number, label: roomLabel(r.room), startAt: r.room.startAt } : null,
    position, waitingTotal,
    payDueAt: r.payDueAt,
    refundStatus: r.refundStatus,
    withdrawnAt: r.withdrawnAt,
    releaseReason: r.releaseReason,
    needsPayment: r.status === "pending" && !!r.payDueAt && !r.paymentProofUrl,
  };
}

// ---- managing rooms (organizer) ---------------------------------------------------------------

export type RoomError = "not_found" | "forbidden" | "closed" | "invalid" | "capacity_below_taken" | "has_entries" | "not_in_tournament" | "room_full";

type Owned = { error: RoomError; message?: string } | { error?: undefined; t: SeatTournament & { organizerId: string; status: string } };
async function ownedTournament(tournamentId: string, organizerId: string): Promise<Owned> {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { ...SEAT_TOURNAMENT_SELECT, organizerId: true, status: true } });
  if (!t) return { error: "not_found" };
  if (t.organizerId !== organizerId) return { error: "forbidden" };
  if (["completed", "cancelled"].includes(t.status)) return { error: "closed" };
  return { t };
}

/** maxTeams is the total of every room's seats once a tournament has rooms. */
async function syncCapacity(tx: Tx, tournamentId: string) {
  const rooms = await tx.tournamentRoom.findMany({ where: { tournamentId }, select: { capacity: true } });
  if (rooms.length === 0) return;
  await tx.tournament.update({ where: { id: tournamentId }, data: { maxTeams: totalSeats(rooms, 0), teamsPerRoom: rooms[rooms.length - 1].capacity } });
}

export async function createRooms(tournamentId: string, organizerId: string, plan: RoomPlan): Promise<{ error: RoomError; message?: string } | { ok: true; created: number }> {
  const own = await ownedTournament(tournamentId, organizerId);
  if (own.error) return own;
  const bad = roomPlanError(plan);
  if (bad) return { error: "invalid", message: bad };
  const made = await prisma.$transaction(async (tx) => {
    await lockSeats(tx, tournamentId);
    const last = await tx.tournamentRoom.aggregate({ where: { tournamentId }, _max: { number: true } });
    const rows = buildRooms(plan, (last._max.number ?? 0) + 1);
    if (rows.length + (last._max.number ?? 0) > 500) return null;
    await tx.tournamentRoom.createMany({ data: rows.map((r) => ({ tournamentId, ...r })) });
    // Entries that were placed before rooms existed stay as they are (outside any room).
    await syncCapacity(tx, tournamentId);
    return rows.length;
  });
  if (made === null) return { error: "invalid", message: "A tournament can have at most 500 rooms." };
  await refreshSeats(tournamentId); // new seats: the queue moves
  return { ok: true, created: made };
}

export async function updateRoom(
  roomId: string, organizerId: string, patch: { name?: string | null; startAt?: Date | null; capacity?: number },
): Promise<{ error: RoomError; message?: string } | { ok: true }> {
  const room = await prisma.tournamentRoom.findUnique({ where: { id: roomId }, select: { id: true, tournamentId: true } });
  if (!room) return { error: "not_found" };
  const own = await ownedTournament(room.tournamentId, organizerId);
  if (own.error) return own;
  if (patch.capacity !== undefined && (!Number.isInteger(patch.capacity) || patch.capacity < 1 || patch.capacity > 1000)) {
    return { error: "invalid", message: "A room needs 1 to 1000 seats." };
  }
  if (patch.name != null && patch.name.length > 40) return { error: "invalid", message: "A room name can be at most 40 characters." };

  const res = await prisma.$transaction(async (tx) => {
    await lockSeats(tx, room.tournamentId);
    if (patch.capacity !== undefined) {
      const taken = await tx.registration.count({ where: { roomId, status: { in: [...SEAT_HOLDING] } } });
      if (patch.capacity < taken) return { error: "capacity_below_taken" as const, message: `This room already has ${taken} ${taken === 1 ? "entry" : "entries"}. Move some to another room first.` };
    }
    await tx.tournamentRoom.update({
      where: { id: roomId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name?.trim() || null } : {}),
        ...(patch.startAt !== undefined ? { startAt: patch.startAt } : {}),
        ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
      },
    });
    await syncCapacity(tx, room.tournamentId);
    return null;
  });
  if (res) return res;
  await refreshSeats(room.tournamentId);
  return { ok: true };
}

export async function deleteRoom(roomId: string, organizerId: string): Promise<{ error: RoomError; message?: string } | { ok: true }> {
  const room = await prisma.tournamentRoom.findUnique({ where: { id: roomId }, select: { id: true, tournamentId: true } });
  if (!room) return { error: "not_found" };
  const own = await ownedTournament(room.tournamentId, organizerId);
  if (own.error) return own;
  const res = await prisma.$transaction(async (tx) => {
    await lockSeats(tx, room.tournamentId);
    const taken = await tx.registration.count({ where: { roomId, status: { in: [...SEAT_HOLDING] } } });
    if (taken > 0) return { error: "has_entries" as const, message: `This room has ${taken} ${taken === 1 ? "entry" : "entries"}. Move them to another room first.` };
    await tx.tournamentRoom.delete({ where: { id: roomId } });
    await syncCapacity(tx, room.tournamentId);
    return null;
  });
  return res ?? { ok: true };
}

/** Organizer moves an entry to another room (it must have a free seat there). */
export async function moveEntryToRoom(registrationId: string, organizerId: string, roomId: string): Promise<{ error: RoomError; message?: string } | { ok: true }> {
  const reg = await prisma.registration.findUnique({ where: { id: registrationId }, select: { id: true, tournamentId: true, status: true } });
  if (!reg) return { error: "not_found" };
  const own = await ownedTournament(reg.tournamentId, organizerId);
  if (own.error) return own;
  if (!(SEAT_HOLDING as readonly string[]).includes(reg.status)) return { error: "invalid", message: "Only an entry that holds a seat can be moved." };
  const res = await prisma.$transaction(async (tx) => {
    await lockSeats(tx, reg.tournamentId);
    const room = await tx.tournamentRoom.findUnique({ where: { id: roomId } });
    if (!room || room.tournamentId !== reg.tournamentId) return { error: "not_in_tournament" as const };
    const taken = await tx.registration.count({ where: { roomId, status: { in: [...SEAT_HOLDING] }, NOT: { id: registrationId } } });
    if (taken >= room.capacity) return { error: "room_full" as const, message: `${roomLabel(room)} is full.` };
    await tx.registration.update({ where: { id: registrationId }, data: { roomId } });
    return null;
  });
  if (res) return res;
  await refreshSeats(reg.tournamentId); // the room it left may have a free seat now
  return { ok: true };
}
