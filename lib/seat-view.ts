// What the screens show about seats. The summary from the service holds Dates, so it is turned into
// plain strings here before it is handed to client components. The wording lives here too, as pure
// functions, so it can be tested.
import type { SeatSummary } from "@/lib/services/rooms";

export interface PublicRoom {
  id: string;
  number: number;
  label: string;
  startAt: string | null;
  capacity: number;
  taken: number;
  seatsLeft: number;
}

export interface PublicSeats {
  hasRooms: boolean;
  rooms: PublicRoom[];
  totalSeats: number;
  taken: number;
  seatsLeft: number;
  waiting: number;
  waitlistEnabled: boolean;
  /** No seat anywhere: a new team goes to the waiting list (or is turned away if there isn't one). */
  full: boolean;
}

export function toPublicSeats(s: SeatSummary): PublicSeats {
  return {
    hasRooms: s.hasRooms,
    rooms: s.rooms.map((r) => ({
      id: r.id, number: r.number, label: r.label, startAt: r.startAt ? r.startAt.toISOString() : null,
      capacity: r.capacity, taken: r.taken, seatsLeft: r.seatsLeft,
    })),
    totalSeats: s.totalSeats, taken: s.taken, seatsLeft: s.seatsLeft, waiting: s.waiting, waitlistEnabled: s.waitlistEnabled,
    full: s.seatsLeft === 0,
  };
}

/** "25/25" or "25/25 · 4 waiting" */
export const seatsLine = (s: Pick<PublicSeats, "taken" | "totalSeats" | "waiting">) =>
  `${s.taken}/${s.totalSeats}${s.waiting > 0 ? ` · ${s.waiting} waiting` : ""}`;

export const seatsLeftText = (n: number) => (n <= 0 ? "Full" : n === 1 ? "1 seat left" : `${n} seats left`);

/**
 * The message to show right after joining: where the entry ended up, and why it isn't where the
 * team asked (a full room sends the team to the nearest one).
 */
export function joinOutcomeMessage(
  entry: { status: string; position?: number | null; waitingTotal?: number; room?: { label: string } | null } | null | undefined,
  asked: { label: string } | null,
  opts: { paid: boolean },
): { text: string; kind: "success" | "info" } {
  if (!entry) return { text: "You're in.", kind: "success" };
  if (entry.status === "waitlisted") {
    const place = entry.position ? `You're #${entry.position}` : "You're";
    return {
      text: `Every seat is taken. ${place} on the waiting list. You move up automatically when a seat frees${opts.paid ? ", and you pay only then" : ""}.`,
      kind: "info",
    };
  }
  if (entry.room && asked && entry.room.label !== asked.label) {
    return { text: `${asked.label} was full, so you're in ${entry.room.label}, the closest one.`, kind: "info" };
  }
  return { text: entry.room ? `You're in ${entry.room.label}.` : "You're in.", kind: "success" };
}
