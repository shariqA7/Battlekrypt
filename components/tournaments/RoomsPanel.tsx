"use client";

// Rooms and seats on the organizer's tournament page: see how full each room is, rename it, move its
// start time, change its seats, add rooms, remove an empty one, and set the waiting list, the payment
// window and (before anyone has entered) the refund policy.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { toast } from "@/lib/toast";
import { entryWord, roomSizeWarning, type GameRules } from "@/lib/game-rules";
import { seatsLeftText, type PublicSeats } from "@/lib/seat-view";
import { PAY_WINDOW, REFUND_CUTOFF, REFUND_POLICIES, REFUND_POLICY_LABELS, describeRefundPolicy, type RefundPolicyKey } from "@/lib/seat-settings";

const inputClass = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[44px] sm:h-[38px] w-full min-w-0";
const labelClass = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1";
const btn = "font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-3 min-h-[44px] sm:min-h-[38px] border disabled:opacity-45 disabled:cursor-not-allowed";
const primary = `${btn} bg-bk-primary text-bk-on-primary border-transparent`;
const ghost = `${btn} border-bk-border text-bk-heading hover:border-bk-gold-light`;

// "2026-12-01T10:30:00.000Z" -> "2026-12-01T15:30" in the organizer's own time zone, for <input type="datetime-local">.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Settings {
  waitlistEnabled: boolean;
  payWindowMinutes: number;
  refundPolicy: RefundPolicyKey;
  refundCutoffHours: number;
}

export default function RoomsPanel({
  tournamentId, seats, settings, paid, refundLocked, editable, game, tournamentStart,
}: {
  tournamentId: string;
  seats: PublicSeats;
  settings: Settings;
  paid: boolean;
  /** Teams have entered, so the refund policy they agreed to can't change. */
  refundLocked: boolean;
  editable: boolean;
  game: (GameRules & { name?: string }) | null;
  tournamentStart: string | null;
}) {
  const router = useRouter();
  // Times are edited in the organizer's own time zone, which the server doesn't know: render after mount.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const unit = game ? entryWord(game) : "teams";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(key: string, url: string, method: string, body?: unknown, ok?: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error?.message ?? "Couldn't save that.");
        return false;
      }
      if (ok) toast(ok, "success", 4000);
      router.refresh();
      return true;
    } catch {
      setError("Couldn't reach the server. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  // ---- room drafts
  type Draft = { name: string; start: string; capacity: string };
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftOf = (r: PublicSeats["rooms"][number]): Draft =>
    drafts[r.id] ?? { name: r.label === `Room ${r.number}` ? "" : r.label, start: toLocalInput(r.startAt), capacity: String(r.capacity) };
  const patchDraft = (r: PublicSeats["rooms"][number], p: Partial<Draft>) => setDrafts((d) => ({ ...d, [r.id]: { ...draftOf(r), ...p } }));
  const dirty = (r: PublicSeats["rooms"][number]) => {
    const d = drafts[r.id];
    return !!d && (d.name !== (r.label === `Room ${r.number}` ? "" : r.label) || d.start !== toLocalInput(r.startAt) || d.capacity !== String(r.capacity));
  };

  async function saveRoom(r: PublicSeats["rooms"][number]) {
    const d = draftOf(r);
    const cap = Number(d.capacity);
    if (!Number.isInteger(cap) || cap < 1) return setError("A room needs at least one seat.");
    const w = game ? roomSizeWarning(game, cap) : null;
    if (w && cap !== r.capacity) toast(w, "warning", 9000);
    const okSaved = await call(`room-${r.id}`, `/api/tournaments/${tournamentId}/rooms/${r.id}`, "PATCH", {
      name: d.name.trim() || null, startAt: d.start ? new Date(d.start).toISOString() : null, capacity: cap,
    }, "Room saved.");
    if (okSaved) setDrafts((x) => { const { [r.id]: _gone, ...rest } = x; void _gone; return rest; });
  }

  // ---- add rooms
  const last = seats.rooms[seats.rooms.length - 1];
  const [add, setAdd] = useState({ count: "1", capacity: String(last?.capacity ?? game?.maxPerMatch ?? 25), gap: "30", first: "" });
  async function addRooms() {
    const count = Number(add.count), capacity = Number(add.capacity), gap = Number(add.gap || 0);
    if (!Number.isInteger(count) || count < 1) return setError("Enter how many rooms to add.");
    if (!Number.isInteger(capacity) || capacity < 1) return setError("Enter the seats in each room.");
    const firstStartAt = add.first ? new Date(add.first).toISOString()
      : last?.startAt ? new Date(new Date(last.startAt).getTime() + (Number.isFinite(gap) ? gap : 0) * 60_000).toISOString()
      : tournamentStart ?? undefined;
    const ok = await call("add", `/api/tournaments/${tournamentId}/rooms`, "POST", { count, capacity, firstStartAt, everyMinutes: gap }, `${count} ${count === 1 ? "room" : "rooms"} added.`);
    if (ok) setAdd((a) => ({ ...a, first: "" }));
  }
  const addWarning = game ? roomSizeWarning(game, Number(add.capacity)) : null;

  // ---- settings
  const [s, setS] = useState({ waitlistEnabled: settings.waitlistEnabled, pay: String(settings.payWindowMinutes), policy: settings.refundPolicy, cutoff: String(settings.refundCutoffHours) });
  const settingsDirty = s.waitlistEnabled !== settings.waitlistEnabled || s.pay !== String(settings.payWindowMinutes) || s.policy !== settings.refundPolicy || s.cutoff !== String(settings.refundCutoffHours);
  async function saveSettings() {
    const pay = Number(s.pay), cutoff = Number(s.cutoff);
    if (paid && s.waitlistEnabled && (!Number.isInteger(pay) || pay < PAY_WINDOW.min || pay > PAY_WINDOW.max)) return setError(`Give teams ${PAY_WINDOW.min} to ${PAY_WINDOW.max} minutes to pay.`);
    if (paid && !refundLocked && s.policy === "full_before_cutoff" && (!Number.isInteger(cutoff) || cutoff < REFUND_CUTOFF.min || cutoff > REFUND_CUTOFF.max)) return setError(`The cut-off must be ${REFUND_CUTOFF.min} to ${REFUND_CUTOFF.max} hours.`);
    const body: Record<string, unknown> = { waitlistEnabled: s.waitlistEnabled };
    if (paid) {
      body.payWindowMinutes = pay;
      if (!refundLocked) { body.refundPolicy = s.policy; body.refundCutoffHours = cutoff; }
    }
    await call("settings", `/api/tournaments/${tournamentId}`, "PATCH", body, "Saved.");
  }

  return (
    <Panel as="section" className="mt-10 p-4">
      <p className="font-sans font-medium text-bk-heading text-sm">Rooms &amp; seats</p>
      <p className="font-sans text-[12px] text-bk-muted mt-1">
        <span className="font-mono text-bk-heading">{seats.taken}/{seats.totalSeats}</span> seats taken
        {seats.waiting > 0 && <> · <span className="text-bk-gold-light">{seats.waiting} waiting</span></>}
        {seats.hasRooms ? ` across ${seats.rooms.length} ${seats.rooms.length === 1 ? "room" : "rooms"}` : ". This tournament is one group of seats. Add a room below to split it into rooms."}
      </p>
      {seats.waiting > 0 && (
        <p className="font-sans text-[12px] text-bk-body mt-1">
          Teams on the waiting list move up by themselves, first come first served, when a seat frees up or you add seats.
        </p>
      )}
      {error && <p className="text-bk-live text-[12px] font-sans mt-3" role="alert">{error}</p>}

      {seats.hasRooms && mounted && (
        <ul className="mt-4 space-y-2 max-h-[460px] overflow-y-auto pr-1" aria-label="Rooms">
          {seats.rooms.map((r) => {
            const d = draftOf(r);
            return (
              <li key={r.id} className="border border-bk-border bg-bk-bg p-3">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="font-sans font-bold text-[13px] text-bk-heading">Room {r.number}</span>
                  <span className={`font-sans text-[11px] uppercase tracking-[0.8px] ${r.seatsLeft === 0 ? "text-bk-live" : "text-bk-teal"}`}>
                    {r.taken}/{r.capacity} · {seatsLeftText(r.seatsLeft)}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_110px]">
                  <div>
                    <label className={labelClass} htmlFor={`n-${r.id}`}>Name (optional)</label>
                    <input id={`n-${r.id}`} value={d.name} maxLength={40} placeholder={`Room ${r.number}`} onChange={(e) => patchDraft(r, { name: e.target.value })} disabled={!editable} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`s-${r.id}`}>Starts</label>
                    <input id={`s-${r.id}`} type="datetime-local" value={d.start} onChange={(e) => patchDraft(r, { start: e.target.value })} disabled={!editable} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`c-${r.id}`}>Seats</label>
                    <input id={`c-${r.id}`} type="number" inputMode="numeric" min={Math.max(1, r.taken)} value={d.capacity} onChange={(e) => patchDraft(r, { capacity: e.target.value })} disabled={!editable} className={inputClass} />
                  </div>
                </div>
                {editable && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button type="button" className={primary} disabled={!dirty(r) || busy === `room-${r.id}`} onClick={() => saveRoom(r)}>
                      {busy === `room-${r.id}` ? "Saving..." : "Save room"}
                    </button>
                    <button
                      type="button" className={ghost} disabled={r.taken > 0 || busy === `del-${r.id}`}
                      title={r.taken > 0 ? "Move its entries to another room first" : "Remove this empty room"}
                      onClick={() => { if (window.confirm(`Remove Room ${r.number}?`)) void call(`del-${r.id}`, `/api/tournaments/${tournamentId}/rooms/${r.id}`, "DELETE", undefined, "Room removed."); }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <div className="mt-5 border-t border-bk-border pt-4">
          <p className="font-sans font-medium text-bk-heading text-[13px]">Add rooms</p>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 mt-2">
            <div>
              <label className={labelClass} htmlFor="add-count">How many</label>
              <input id="add-count" type="number" inputMode="numeric" min={1} max={500} value={add.count} onChange={(e) => setAdd({ ...add, count: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="add-cap">Seats each</label>
              <input id="add-cap" type="number" inputMode="numeric" min={1} max={1000} value={add.capacity} onChange={(e) => setAdd({ ...add, capacity: e.target.value })}
                onBlur={() => { if (addWarning) toast(addWarning, "warning", 9000); }} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="add-gap">Minutes apart</label>
              <input id="add-gap" type="number" inputMode="numeric" min={0} max={1440} value={add.gap} onChange={(e) => setAdd({ ...add, gap: e.target.value })} className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass} htmlFor="add-first">First starts</label>
              <input id="add-first" type="datetime-local" value={add.first} onChange={(e) => setAdd({ ...add, first: e.target.value })} className={inputClass} />
            </div>
          </div>
          <p className="font-sans text-[11px] text-bk-muted mt-1.5">
            Leave &quot;First starts&quot; empty to continue after the last room. {Number(add.count) > 0 && Number(add.capacity) > 0 && <>Adds {(Number(add.count) * Number(add.capacity)).toLocaleString("en-US")} {unit}.</>}
          </p>
          {addWarning && <p className="font-sans text-[12px] text-bk-gold-light mt-1.5" role="status">{addWarning}</p>}
          <button type="button" className={`${primary} mt-3`} disabled={busy === "add"} onClick={addRooms}>{busy === "add" ? "Adding..." : "Add rooms"}</button>
        </div>
      )}

      <div className="mt-5 border-t border-bk-border pt-4">
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={s.waitlistEnabled} disabled={!editable} onChange={(e) => setS({ ...s, waitlistEnabled: e.target.checked })} className="mt-0.5 w-4 h-4 shrink-0" />
          <span className="font-sans text-[13px] text-bk-heading">
            Waiting list
            <span className="block text-[12px] text-bk-muted">Extra teams queue when every seat is taken. Switch it off and they are told the tournament is full.</span>
          </span>
        </label>

        {paid && s.waitlistEnabled && (
          <div className="max-w-[260px] mt-3">
            <label className={labelClass} htmlFor="set-pay">Minutes to pay after a seat opens</label>
            <input id="set-pay" type="number" inputMode="numeric" min={5} max={1440} value={s.pay} disabled={!editable} onChange={(e) => setS({ ...s, pay: e.target.value })} className={inputClass} />
          </div>
        )}

        {paid && (
          <fieldset className="mt-4" disabled={!editable || refundLocked}>
            <legend className={labelClass}>Refund policy</legend>
            {refundLocked && <p className="font-sans text-[12px] text-bk-muted mb-2">Teams have entered, so the policy they agreed to can no longer change.</p>}
            <div className="space-y-2">
              {REFUND_POLICIES.map((p) => (
                <label key={p} className={`flex items-start gap-2 px-3 py-2 border ${s.policy === p ? "border-bk-gold-light bg-bk-gold-from/10" : "border-bk-border bg-bk-bg"} ${refundLocked ? "opacity-70" : "cursor-pointer"}`}>
                  <input type="radio" name="panel-refund" checked={s.policy === p} onChange={() => setS({ ...s, policy: p })} className="mt-1 w-4 h-4 shrink-0" />
                  <span className="font-sans text-[13px] text-bk-heading">
                    {REFUND_POLICY_LABELS[p]}
                    <span className="block text-[12px] text-bk-muted">{describeRefundPolicy(p, Number(s.cutoff) || settings.refundCutoffHours)}</span>
                  </span>
                </label>
              ))}
            </div>
            {s.policy === "full_before_cutoff" && (
              <div className="max-w-[260px] mt-3">
                <label className={labelClass} htmlFor="set-cutoff">Cut-off (hours before the room starts)</label>
                <input id="set-cutoff" type="number" inputMode="numeric" min={0} max={720} value={s.cutoff} onChange={(e) => setS({ ...s, cutoff: e.target.value })} className={inputClass} />
              </div>
            )}
          </fieldset>
        )}

        {editable && (
          <button type="button" className={`${primary} mt-4`} disabled={!settingsDirty || busy === "settings"} onClick={saveSettings}>
            {busy === "settings" ? "Saving..." : "Save settings"}
          </button>
        )}
      </div>
    </Panel>
  );
}
