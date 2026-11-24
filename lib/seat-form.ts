// The organizer's seat form (rooms, waiting list, refund policy) as plain data: its defaults for a
// game, its validation, and the request body it sends. Pure, so it can be tested; the component in
// components/tournaments/SeatsFields.tsx only shows it.
import { isHeadToHead } from "@/lib/game-rules";
import { MAX_ROOM_CAPACITY, MAX_ROOMS_PER_TOURNAMENT } from "@/lib/rooms";
import { PAY_WINDOW, REFUND_CUTOFF, type RefundPolicyKey } from "@/lib/seat-settings";

export interface SeatForm {
  useRooms: boolean;
  roomCount: string;
  perRoom: string;
  /** datetime-local value; empty means "when the tournament starts". */
  firstStart: string;
  everyMinutes: string;
  /** Used only when rooms are off. */
  maxTeams: string;
  waitlistEnabled: boolean;
  payWindowMinutes: string;
  refundPolicy: RefundPolicyKey;
  refundCutoffHours: string;
}

export const DEFAULT_SEAT_FORM: SeatForm = {
  useRooms: false, roomCount: "1", perRoom: "", firstStart: "", everyMinutes: "30", maxTeams: "64",
  waitlistEnabled: true, payWindowMinutes: String(PAY_WINDOW.fallback), refundPolicy: "organizer_decides", refundCutoffHours: String(REFUND_CUTOFF.fallback),
};

type GameLimit = { maxPerMatch?: number | null } | null | undefined;

/**
 * Picking a game sets sensible room defaults: a lobby game (a battle royale, a racing lobby) starts with
 * rooms of the game's size; a head-to-head game (1v1 or team vs team) runs as a bracket, so no rooms.
 */
export function seatDefaultsForGame(prev: SeatForm, game: GameLimit): SeatForm {
  if (!game || game.maxPerMatch == null) return prev;
  if (isHeadToHead(game)) return { ...prev, useRooms: false };
  return { ...prev, useRooms: true, perRoom: String(game.maxPerMatch) };
}

const whole = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function totalSeatsOf(f: SeatForm): number | null {
  if (!f.useRooms) {
    const n = whole(f.maxTeams);
    return Number.isInteger(n) && n >= 1 ? n : null;
  }
  const c = whole(f.roomCount), p = whole(f.perRoom);
  return Number.isInteger(c) && Number.isInteger(p) && c >= 1 && p >= 1 ? c * p : null;
}

/** A message when the form can't be sent yet. */
export function seatFormError(f: SeatForm, paid: boolean): string | null {
  if (f.useRooms) {
    const c = whole(f.roomCount), p = whole(f.perRoom);
    if (!Number.isInteger(c) || c < 1) return "Enter how many rooms you want.";
    if (c > MAX_ROOMS_PER_TOURNAMENT) return `A tournament can have at most ${MAX_ROOMS_PER_TOURNAMENT} rooms.`;
    if (!Number.isInteger(p) || p < 1) return "Enter how many teams fit in a room.";
    if (p > MAX_ROOM_CAPACITY) return `A room can have at most ${MAX_ROOM_CAPACITY} seats.`;
    const gap = whole(f.everyMinutes);
    if (c > 1 && (!Number.isInteger(gap) || gap < 0 || gap > 1440)) return "The gap between rooms must be 0 to 1440 minutes.";
  } else {
    const n = whole(f.maxTeams);
    if (!Number.isInteger(n) || n < 1) return "Enter the most teams you will take (at least 1).";
  }
  if (paid) {
    const w = whole(f.payWindowMinutes);
    if (f.waitlistEnabled && (!Number.isInteger(w) || w < PAY_WINDOW.min || w > PAY_WINDOW.max)) {
      return `Give a promoted team ${PAY_WINDOW.min} to ${PAY_WINDOW.max} minutes to pay.`;
    }
    const h = whole(f.refundCutoffHours);
    if (f.refundPolicy === "full_before_cutoff" && (!Number.isInteger(h) || h < REFUND_CUTOFF.min || h > REFUND_CUTOFF.max)) {
      return `The refund cut-off must be ${REFUND_CUTOFF.min} to ${REFUND_CUTOFF.max} hours.`;
    }
  }
  return null;
}

/**
 * The fields to send. `startAtIso` is the tournament's start; rooms start from there unless the
 * organizer chose a different first-room time. The refund and payment-window settings only matter
 * (and are only sent as chosen) for a paid tournament.
 */
export function seatPayload(f: SeatForm, paid: boolean, startAtIso: string | undefined) {
  const out: Record<string, unknown> = { waitlistEnabled: f.waitlistEnabled };
  if (paid) {
    out.payWindowMinutes = f.waitlistEnabled ? Number(f.payWindowMinutes) : PAY_WINDOW.fallback;
    out.refundPolicy = f.refundPolicy;
    out.refundCutoffHours = f.refundPolicy === "full_before_cutoff" ? Number(f.refundCutoffHours) : REFUND_CUTOFF.fallback;
  }
  if (f.useRooms) {
    const count = Number(f.roomCount);
    const first = f.firstStart ? new Date(f.firstStart).toISOString() : startAtIso;
    out.maxTeams = count * Number(f.perRoom);
    out.rooms = { count, capacity: Number(f.perRoom), firstStartAt: first, everyMinutes: count > 1 ? Number(f.everyMinutes) : 0 };
  } else {
    out.maxTeams = Number(f.maxTeams);
  }
  return out;
}
