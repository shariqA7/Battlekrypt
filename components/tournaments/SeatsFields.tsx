"use client";

// The organizer's seat settings on the tournament form: how many rooms and seats, whether extra teams
// can wait for a seat, and (for paid events) the payment window and the refund policy.
import { useState } from "react";
import { toast } from "@/lib/toast";
import { entryWord, isHeadToHead, roomSizeWarning, type GameRules } from "@/lib/game-rules";
import { totalSeatsOf, type SeatForm } from "@/lib/seat-form";
import { REFUND_POLICIES, REFUND_POLICY_LABELS, describeRefundPolicy, type RefundPolicyKey } from "@/lib/seat-settings";

type Game = (GameRules & { name?: string }) | undefined;

export default function SeatsFields({
  value, onChange, paid, game, inputClass, labelClass,
}: {
  value: SeatForm;
  onChange: (next: SeatForm) => void;
  paid: boolean;
  game: Game;
  inputClass: string;
  labelClass: string;
}) {
  const set = (patch: Partial<SeatForm>) => onChange({ ...value, ...patch });
  const headToHead = !!game && isHeadToHead(game);
  const total = totalSeatsOf(value);
  const unit = game ? entryWord(game) : "teams";
  const perRoomNumber = Number(value.perRoom);
  const warning = value.useRooms && game ? roomSizeWarning(game, perRoomNumber) : null;
  // One toast per value, not one per keystroke: it appears when the field loses focus.
  const [warnedFor, setWarnedFor] = useState<number | null>(null);
  const warnOnBlur = () => {
    if (warning && warnedFor !== perRoomNumber) {
      toast(warning, "warning", 9000);
      setWarnedFor(perRoomNumber);
    }
  };

  return (
    <div>
      {game?.maxPerMatch != null && (
        <p className="font-sans text-bk-muted text-[11px] mt-4">
          {headToHead
            ? `${game.name ?? "This game"} is played one side against another, so it runs as a bracket or league and doesn't need rooms.`
            : `${game.name ?? "This game"}: a room usually holds ${game.maxPerMatch} ${entryWord(game)}.`}
          {game.matchLimitNote && !headToHead ? ` ${game.matchLimitNote}` : ""}
        </p>
      )}

      {!headToHead && (
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="How entries are organised">
          {[
            { on: false, title: "One group", detail: "A single pool of seats" },
            { on: true, title: "Several rooms", detail: "Each with its own time and seats" },
          ].map((o) => (
            <button
              key={o.title}
              type="button"
              role="radio"
              aria-checked={value.useRooms === o.on}
              onClick={() => set({ useRooms: o.on })}
              className={`text-left px-3 py-2 min-h-[48px] border transition-colors ${value.useRooms === o.on ? "border-bk-gold-light bg-bk-gold-from/10" : "border-bk-border bg-bk-bg hover:border-bk-gold-light/60"}`}
            >
              <span className="block font-sans font-bold text-[13px] text-bk-heading">{o.title}</span>
              <span className="block font-sans text-[11px] text-bk-muted">{o.detail}</span>
            </button>
          ))}
        </div>
      )}

      {value.useRooms && !headToHead ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="seat-rooms">Number of rooms</label>
              <input id="seat-rooms" type="number" inputMode="numeric" min={1} max={500} value={value.roomCount} onChange={(e) => set({ roomCount: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="seat-per-room">{entryWord(game ?? {}, 2).replace(/^./, (c) => c.toUpperCase())} per room</label>
              <input
                id="seat-per-room" type="number" inputMode="numeric" min={1} max={1000} value={value.perRoom}
                onChange={(e) => set({ perRoom: e.target.value })} onBlur={warnOnBlur} className={inputClass}
                aria-describedby={warning ? "seat-warning" : undefined}
              />
            </div>
          </div>
          {warning && (
            <p id="seat-warning" role="status" className="font-sans text-[12px] text-bk-gold-light mt-1.5">
              {warning}
            </p>
          )}
          {Number(value.roomCount) > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="seat-first">First room starts (optional)</label>
                <input id="seat-first" type="datetime-local" value={value.firstStart} onChange={(e) => set({ firstStart: e.target.value })} className={inputClass} />
                <p className="font-sans text-[11px] text-bk-muted mt-1">Leave empty to start when the tournament does.</p>
              </div>
              <div>
                <label className={labelClass} htmlFor="seat-gap">Minutes between rooms</label>
                <input id="seat-gap" type="number" inputMode="numeric" min={0} max={1440} value={value.everyMinutes} onChange={(e) => set({ everyMinutes: e.target.value })} className={inputClass} />
              </div>
            </div>
          )}
          <p className="font-sans text-[12px] text-bk-body mt-2">
            {total != null ? <>Total: <span className="font-mono text-bk-heading">{total.toLocaleString("en-US")}</span> {unit}. You can add, rename or resize rooms later.</> : "Enter the number of rooms and the seats in each."}
          </p>
        </>
      ) : (
        <div className="max-w-[260px]">
          <label className={labelClass} htmlFor="seat-max">Max {headToHead ? (game && (game.teamSizeMax ?? 2) <= 1 ? "players" : "teams") : "teams"}</label>
          <input id="seat-max" type="number" inputMode="numeric" min={1} required value={value.maxTeams} onChange={(e) => set({ maxTeams: e.target.value })} className={inputClass} />
        </div>
      )}

      <label className="flex items-start gap-2 mt-5 cursor-pointer">
        <input type="checkbox" checked={value.waitlistEnabled} onChange={(e) => set({ waitlistEnabled: e.target.checked })} className="mt-0.5 w-4 h-4 shrink-0" />
        <span className="font-sans text-[13px] text-bk-heading">
          Waiting list
          <span className="block text-[12px] text-bk-muted">
            When every seat is taken, extra teams queue (first come, first served) and take the next seat that frees up.
            {paid ? " On a paid event they pay only once a seat opens for them." : ""}
          </span>
        </span>
      </label>

      {paid && (
        <>
          {value.waitlistEnabled && (
            <div className="max-w-[260px]">
              <label className={labelClass} htmlFor="seat-pay-window">Minutes to pay after a seat opens</label>
              <input id="seat-pay-window" type="number" inputMode="numeric" min={5} max={1440} value={value.payWindowMinutes} onChange={(e) => set({ payWindowMinutes: e.target.value })} className={inputClass} />
              <p className="font-sans text-[11px] text-bk-muted mt-1">If they don&apos;t pay in time, the seat goes to the next team.</p>
            </div>
          )}

          <fieldset className="mt-5">
            <legend className={`${labelClass} mt-0`}>Refund policy</legend>
            <p className="font-sans text-[11px] text-bk-muted mb-2">Players read this before they pay, and it can&apos;t change once teams have entered.</p>
            <div className="space-y-2">
              {REFUND_POLICIES.map((p: RefundPolicyKey) => (
                <label key={p} className={`flex items-start gap-2 px-3 py-2 border cursor-pointer ${value.refundPolicy === p ? "border-bk-gold-light bg-bk-gold-from/10" : "border-bk-border bg-bk-bg"}`}>
                  <input type="radio" name="refund-policy" checked={value.refundPolicy === p} onChange={() => set({ refundPolicy: p })} className="mt-1 w-4 h-4 shrink-0" />
                  <span className="font-sans text-[13px] text-bk-heading">
                    {REFUND_POLICY_LABELS[p]}
                    <span className="block text-[12px] text-bk-muted">{describeRefundPolicy(p, Number(value.refundCutoffHours) || 24)}</span>
                  </span>
                </label>
              ))}
            </div>
            {value.refundPolicy === "full_before_cutoff" && (
              <div className="max-w-[260px]">
                <label className={labelClass} htmlFor="seat-cutoff">Refund cut-off (hours before the room starts)</label>
                <input id="seat-cutoff" type="number" inputMode="numeric" min={0} max={720} value={value.refundCutoffHours} onChange={(e) => set({ refundCutoffHours: e.target.value })} className={inputClass} />
              </div>
            )}
          </fieldset>
        </>
      )}
    </div>
  );
}
