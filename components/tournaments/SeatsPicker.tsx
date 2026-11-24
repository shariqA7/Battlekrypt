"use client";

import { useEffect, useState } from "react";
import LocalDate from "@/components/ui/LocalDate";
import { seatsLeftText, type PublicSeats } from "@/lib/seat-view";

// Choose which room to play in. A room with no seat left can't be picked; a team that asks for a full
// room is placed in the closest one with space, and told so after joining.
// Many rooms (a big tournament) switch from a list to a dropdown so the page doesn't become a wall.
const LIST_MAX = 6;

export default function SeatsPicker({
  seats,
  value,
  onChange,
  fallbackStart,
  inputClass,
}: {
  seats: PublicSeats;
  value: string;
  onChange: (roomId: string) => void;
  fallbackStart: string | null;
  inputClass: string;
}) {
  // Times are shown in the viewer's own time zone, which the server doesn't know, so inside a
  // dropdown (plain text) they appear only after mount.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const fmt = (iso: string | null) =>
    mounted && (iso ?? fallbackStart) ? new Date((iso ?? fallbackStart) as string).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

  if (!seats.hasRooms || seats.rooms.length === 0) return null;
  const open = seats.rooms.filter((r) => r.seatsLeft > 0);

  if (seats.rooms.length > LIST_MAX) {
    return (
      <div>
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} aria-label="Room">
          <option value="">Any room (the earliest with a seat)</option>
          {seats.rooms.map((r) => (
            <option key={r.id} value={r.id} disabled={r.seatsLeft === 0}>
              {r.label}
              {fmt(r.startAt) ? ` · ${fmt(r.startAt)}` : ""} · {seatsLeftText(r.seatsLeft)}
            </option>
          ))}
        </select>
        <p className="font-sans text-[11px] text-bk-muted mt-1">
          {open.length} of {seats.rooms.length} rooms have seats. If your room fills first, you&apos;re placed in the closest one.
        </p>
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label="Room" className="space-y-2">
      {seats.rooms.length > 1 && (
        <RoomOption selected={value === ""} onSelect={() => onChange("")} title="Any room" detail="The earliest room with a seat" />
      )}
      {seats.rooms.map((r) => (
        <RoomOption
          key={r.id}
          selected={value === r.id}
          disabled={r.seatsLeft === 0}
          onSelect={() => onChange(r.id)}
          title={r.label}
          detail={
            <>
              {r.startAt ? <LocalDate iso={r.startAt} format="long" /> : fallbackStart ? <LocalDate iso={fallbackStart} format="long" /> : null}
            </>
          }
          badge={seatsLeftText(r.seatsLeft)}
        />
      ))}
    </div>
  );
}

function RoomOption({
  selected, disabled, onSelect, title, detail, badge,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  detail: React.ReactNode;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`w-full min-h-[48px] flex items-center justify-between gap-3 text-left px-3 py-2 border transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
        selected ? "border-bk-gold-light bg-bk-gold-from/10" : "border-bk-border bg-bk-bg hover:border-bk-gold-light/60"
      }`}
    >
      <span className="min-w-0">
        <span className="block font-sans font-bold text-[13px] text-bk-heading">{title}</span>
        {detail && <span className="block font-sans text-[12px] text-bk-muted">{detail}</span>}
      </span>
      {badge && (
        <span className={`shrink-0 font-sans text-[11px] uppercase tracking-[0.8px] ${badge === "Full" ? "text-bk-live" : "text-bk-teal"}`}>{badge}</span>
      )}
    </button>
  );
}
