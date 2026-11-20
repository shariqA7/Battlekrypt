// The organizer's seat settings for a tournament: the waiting list, how long a promoted team has
// to pay, the refund policy, and (when creating) how many rooms to start with. Pure, so it is easy
// to test, and shared by the create and edit routes.
import { roomPlanError, type RoomPlan } from "@/lib/rooms";

export const REFUND_POLICIES = ["organizer_decides", "no_refund", "full_before_cutoff", "if_resold"] as const;
export type RefundPolicyKey = (typeof REFUND_POLICIES)[number];

export const PAY_WINDOW = { min: 5, max: 1440, fallback: 60 } as const;
export const REFUND_CUTOFF = { min: 0, max: 720, fallback: 24 } as const;

export interface SeatSettings {
  waitlistEnabled: boolean;
  payWindowMinutes: number;
  refundPolicy: RefundPolicyKey;
  refundCutoffHours: number;
  rooms: RoomPlan | null;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const num = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : Number(v));

/**
 * Reads the seat settings out of a request body. Anything not sent gets its default; anything sent
 * but wrong is refused with a message the organizer can act on.
 */
export function parseSeatSettings(body: Record<string, unknown>): { ok: true; value: SeatSettings } | { ok: false; message: string } {
  const value: SeatSettings = {
    waitlistEnabled: true, payWindowMinutes: PAY_WINDOW.fallback, refundPolicy: "organizer_decides", refundCutoffHours: REFUND_CUTOFF.fallback, rooms: null,
  };
  if (body.waitlistEnabled !== undefined) {
    if (typeof body.waitlistEnabled !== "boolean") return { ok: false, message: "The waiting list must be on or off." };
    value.waitlistEnabled = body.waitlistEnabled;
  }
  const pay = num(body.payWindowMinutes);
  if (pay !== undefined) {
    if (!isInt(pay) || pay < PAY_WINDOW.min || pay > PAY_WINDOW.max) return { ok: false, message: `The payment window must be ${PAY_WINDOW.min} to ${PAY_WINDOW.max} minutes.` };
    value.payWindowMinutes = pay;
  }
  if (body.refundPolicy !== undefined) {
    if (!(REFUND_POLICIES as readonly unknown[]).includes(body.refundPolicy)) return { ok: false, message: "Choose a refund policy from the list." };
    value.refundPolicy = body.refundPolicy as RefundPolicyKey;
  }
  const cutoff = num(body.refundCutoffHours);
  if (cutoff !== undefined) {
    if (!isInt(cutoff) || cutoff < REFUND_CUTOFF.min || cutoff > REFUND_CUTOFF.max) return { ok: false, message: `The refund cut-off must be ${REFUND_CUTOFF.min} to ${REFUND_CUTOFF.max} hours before the room starts.` };
    value.refundCutoffHours = cutoff;
  }
  if (body.rooms !== undefined && body.rooms !== null) {
    const r = body.rooms as Record<string, unknown>;
    if (typeof r !== "object") return { ok: false, message: "Room details are missing." };
    const first = r.firstStartAt ? new Date(String(r.firstStartAt)) : null;
    if (first && Number.isNaN(first.getTime())) return { ok: false, message: "The first room's start time isn't a valid date." };
    const plan: RoomPlan = { count: Number(r.count), capacity: Number(r.capacity), firstStartAt: first, everyMinutes: num(r.everyMinutes) ?? 0 };
    const bad = roomPlanError(plan);
    if (bad) return { ok: false, message: bad };
    value.rooms = plan;
  }
  return { ok: true, value };
}

/** One plain sentence a player reads before paying. */
export function describeRefundPolicy(policy: RefundPolicyKey, cutoffHours: number): string {
  switch (policy) {
    case "no_refund":
      return "No refunds. If you pull out after paying, your entry fee is not returned.";
    case "full_before_cutoff":
      return cutoffHours === 0
        ? "Full refund if you withdraw before your room starts. None once it has started."
        : `Full refund if you withdraw at least ${cutoffHours} ${cutoffHours === 1 ? "hour" : "hours"} before your room starts. None after that.`;
    case "if_resold":
      return "Refunded only if another team takes your seat from the waiting list. If nobody does, there is no refund.";
    default:
      return "Refunds are at the organizer's discretion. They decide each request.";
  }
}

export const REFUND_POLICY_LABELS: Record<RefundPolicyKey, string> = {
  organizer_decides: "I decide each case",
  no_refund: "No refunds",
  full_before_cutoff: "Full refund before a cut-off time",
  if_resold: "Refund only if the seat is taken from the waiting list",
};
