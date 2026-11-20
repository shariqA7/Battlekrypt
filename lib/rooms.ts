// Rooms and the waiting list, as pure rules (no database). lib/services/rooms.ts runs them
// inside a locked transaction so two teams can never take the same last seat.
//
// A tournament can have many rooms (lobbies), each with its own start time and seats. A tournament
// with no rooms is one pool of `maxTeams` seats, exactly as before.

export interface RoomSeat {
  id: string;
  number: number;
  name?: string | null;
  startAt: Date | null; // null = the tournament's own start time
  capacity: number;
  taken: number; // pending + approved entries in this room
}

export const seatsLeft = (r: Pick<RoomSeat, "capacity" | "taken">) => Math.max(0, r.capacity - r.taken);
export const roomLabel = (r: { number: number; name?: string | null }) => r.name?.trim() || `Room ${r.number}`;
export const roomStart = (r: { startAt: Date | null }, tournamentStart: Date | null) => r.startAt ?? tournamentStart;

/** Rooms in the order they play: by start time, then number. */
export function inPlayOrder<T extends Pick<RoomSeat, "number" | "startAt">>(rooms: T[], tournamentStart: Date | null): T[] {
  const t = (r: T) => roomStart(r, tournamentStart)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return [...rooms].sort((a, b) => t(a) - t(b) || a.number - b.number);
}

export type RoomChoice = { room: RoomSeat; why: "preferred" | "nearest" | "earliest" };

/**
 * Which room should the next entry go to?
 *  - the one they asked for, if it has a seat;
 *  - otherwise the room closest in time to the one they asked for (a "close to that time" room);
 *  - with no preference, the earliest room that still has room, so rooms fill one after another.
 * Returns null when every room is full.
 */
export function pickRoom(rooms: RoomSeat[], preferredId: string | null | undefined, tournamentStart: Date | null): RoomChoice | null {
  const open = inPlayOrder(rooms.filter((r) => seatsLeft(r) > 0), tournamentStart);
  if (open.length === 0) return null;
  const wanted = preferredId ? rooms.find((r) => r.id === preferredId) : undefined;
  if (!wanted) return { room: open[0], why: "earliest" };
  if (seatsLeft(wanted) > 0) return { room: wanted, why: "preferred" };

  const wantedAt = roomStart(wanted, tournamentStart)?.getTime() ?? null;
  const distance = (r: RoomSeat) => {
    const at = roomStart(r, tournamentStart)?.getTime() ?? null;
    return wantedAt != null && at != null ? Math.abs(at - wantedAt) : Math.abs(r.number - wanted.number) * 1e9;
  };
  const nearest = [...open].sort((a, b) => distance(a) - distance(b) || a.number - b.number)[0];
  return { room: nearest, why: "nearest" };
}

export type Placement =
  | { kind: "seat"; roomId: string | null; why: RoomChoice["why"] | "single_room" }
  | { kind: "waitlist" }
  | { kind: "full" };

/**
 * Seat, waiting list, or turned away?
 *  - rooms exist: pick a room (above); all full -> waiting list if the organizer allows it;
 *  - no rooms: a seat while fewer than maxTeams are taken.
 * `waitingCount > 0` means people are already queued, so a newcomer goes to the back of the queue
 * rather than past them (the engine promotes the queue first, so a seat and a queue seldom coexist).
 */
export function decidePlacement(i: {
  rooms: RoomSeat[];
  preferredRoomId?: string | null;
  tournamentStart: Date | null;
  maxTeams: number;
  takenWithoutRoom: number;
  waitlistEnabled: boolean;
  waitingCount: number;
}): Placement {
  const queue: Placement = i.waitlistEnabled ? { kind: "waitlist" } : { kind: "full" };
  if (i.waitingCount > 0) return queue;
  if (i.rooms.length > 0) {
    const choice = pickRoom(i.rooms, i.preferredRoomId, i.tournamentStart);
    return choice ? { kind: "seat", roomId: choice.room.id, why: choice.why } : queue;
  }
  return i.takenWithoutRoom < i.maxTeams ? { kind: "seat", roomId: null, why: "single_room" } : queue;
}

export interface Waiting {
  id: string;
  waitlistedAt: Date;
}

/** First come, first served: oldest first, ties broken by id so the order never flips. */
export const queueOrder = <T extends Waiting>(w: T[]): T[] =>
  [...w].sort((a, b) => a.waitlistedAt.getTime() - b.waitlistedAt.getTime() || (a.id < b.id ? -1 : 1));

/** 1-based place of `id` in the queue, or null if it isn't queued. */
export function queuePosition(w: Waiting[], id: string): number | null {
  const i = queueOrder(w).findIndex((x) => x.id === id);
  return i === -1 ? null : i + 1;
}

/**
 * Hand every free seat to the queue, in order. Rooms fill earliest first. Returns who goes where
 * (roomId null = the single pool of a tournament with no rooms).
 */
export function planPromotions(i: {
  rooms: RoomSeat[];
  tournamentStart: Date | null;
  maxTeams: number;
  takenWithoutRoom: number;
  waiting: Waiting[];
}): { registrationId: string; roomId: string | null }[] {
  const out: { registrationId: string; roomId: string | null }[] = [];
  const rooms = i.rooms.map((r) => ({ ...r }));
  let pool = Math.max(0, i.maxTeams - i.takenWithoutRoom);
  for (const w of queueOrder(i.waiting)) {
    if (rooms.length > 0) {
      const choice = pickRoom(rooms, null, i.tournamentStart);
      if (!choice) break;
      choice.room.taken += 1;
      out.push({ registrationId: w.id, roomId: choice.room.id });
    } else {
      if (pool <= 0) break;
      pool -= 1;
      out.push({ registrationId: w.id, roomId: null });
    }
  }
  return out;
}

/** The time a promoted (or newly seated, unpaid) team has to pay by. */
export const payDeadline = (now: Date, minutes: number) => new Date(now.getTime() + Math.max(1, minutes) * 60_000);

// ---- Building rooms ---------------------------------------------------------------------------

export interface RoomPlan {
  count: number; // how many rooms
  capacity: number; // seats in each
  firstStartAt: Date | null; // when Room 1 starts (null = the tournament's start)
  everyMinutes: number; // gap between one room and the next (0 = all at once)
}

export const MAX_ROOMS_PER_TOURNAMENT = 500;
export const MAX_ROOM_CAPACITY = 1000;

export function roomPlanError(p: RoomPlan): string | null {
  if (!Number.isInteger(p.count) || p.count < 1) return "Add at least one room.";
  if (p.count > MAX_ROOMS_PER_TOURNAMENT) return `A tournament can have at most ${MAX_ROOMS_PER_TOURNAMENT} rooms.`;
  if (!Number.isInteger(p.capacity) || p.capacity < 1) return "A room needs at least one seat.";
  if (p.capacity > MAX_ROOM_CAPACITY) return `A room can have at most ${MAX_ROOM_CAPACITY} seats.`;
  if (!Number.isInteger(p.everyMinutes) || p.everyMinutes < 0 || p.everyMinutes > 24 * 60) return "The gap between rooms must be 0 to 1440 minutes.";
  return null;
}

/** Rooms numbered from `startNumber`, evenly spaced in time. */
export function buildRooms(p: RoomPlan, startNumber = 1): { number: number; startAt: Date | null; capacity: number }[] {
  return Array.from({ length: p.count }, (_, k) => ({
    number: startNumber + k,
    startAt: p.firstStartAt ? new Date(p.firstStartAt.getTime() + k * p.everyMinutes * 60_000) : null,
    capacity: p.capacity,
  }));
}

/** The tournament's total seats: every room's capacity added up (or maxTeams when there are no rooms). */
export const totalSeats = (rooms: { capacity: number }[], maxTeams: number) =>
  rooms.length > 0 ? rooms.reduce((s, r) => s + r.capacity, 0) : maxTeams;
