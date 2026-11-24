import LocalDate from "@/components/ui/LocalDate";
import { seatsLeftText, type PublicSeats } from "@/lib/seat-view";

// The rooms of a tournament with several: when each starts and how many seats are left. Shown on the
// public page so a team can see where there is room before it joins.
export default function RoomsOverview({ seats, fallbackStart }: { seats: PublicSeats; fallbackStart: string | null }) {
  if (!seats.hasRooms || seats.rooms.length < 2) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label="Rooms">
      {seats.rooms.map((r) => {
        const pct = r.capacity > 0 ? Math.min(100, Math.round((r.taken / r.capacity) * 100)) : 0;
        const at = r.startAt ?? fallbackStart;
        return (
          <li key={r.id} className="border border-bk-border bg-bk-surface px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-sans font-bold text-[14px] text-bk-heading">{r.label}</span>
              <span className={`font-sans text-[11px] uppercase tracking-[0.8px] ${r.seatsLeft === 0 ? "text-bk-live" : "text-bk-teal"}`}>{seatsLeftText(r.seatsLeft)}</span>
            </div>
            {at && <p className="font-sans text-[12px] text-bk-muted mt-0.5"><LocalDate iso={at} format="long" /></p>}
            <div className="mt-2 h-1.5 bg-bk-border" role="img" aria-label={`${r.taken} of ${r.capacity} seats taken`}>
              <div className={`h-full ${r.seatsLeft === 0 ? "bg-bk-live" : "bg-bk-gold-light"}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="font-mono text-[11px] text-bk-muted mt-1">{r.taken}/{r.capacity}</p>
          </li>
        );
      })}
    </ul>
  );
}
