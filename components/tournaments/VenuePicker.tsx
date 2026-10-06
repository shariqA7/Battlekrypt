"use client";

// Online vs LAN, plus venue details and the self check-in window (spec §8).
// Shared by the create and edit forms. Times are datetime-local strings.
export type VenueTypeValue = "online" | "lan" | "hybrid";

export interface VenueValue {
  venueType: VenueTypeValue;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  checkInOpensAt: string;
  checkInClosesAt: string;
}

const inputClass =
  "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
const labelClass =
  "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

export default function VenuePicker({
  value,
  onChange,
  typeLocked = false,
}: {
  value: VenueValue;
  onChange: (v: VenueValue) => void;
  typeLocked?: boolean;
}) {
  const set = (patch: Partial<VenueValue>) => onChange({ ...value, ...patch });
  const btn = (active: boolean) =>
    `flex-1 h-[38px] text-[12px] font-sans uppercase tracking-[0.5px] disabled:opacity-60 ${
      active ? "bg-bk-gold-light text-bk-bg" : "bg-bk-surface text-bk-body border border-bk-border"
    }`;

  return (
    <div>
      <label className={labelClass}>Where is it played</label>
      <div className="flex gap-2">
        <button type="button" disabled={typeLocked} onClick={() => set({ venueType: "online" })} className={btn(value.venueType === "online")}>
          Online
        </button>
        <button type="button" disabled={typeLocked} onClick={() => set({ venueType: "lan" })} className={btn(value.venueType === "lan")}>
          LAN / on-site
        </button>
        <button type="button" disabled={typeLocked} onClick={() => set({ venueType: "hybrid" })} className={btn(value.venueType === "hybrid")}>
          Hybrid
        </button>
      </div>

      {value.venueType === "hybrid" && (
        <p className="font-sans text-[11px] text-bk-muted mt-2">
          Hybrid: each stage has its own venue — for example online qualifiers and a LAN
          final. After you create it, set each stage&apos;s venue on the tournament page and
          choose which entries advance.
        </p>
      )}

      {value.venueType === "lan" && (
        <>
          <p className="font-sans text-[11px] text-bk-muted mt-2">
            LAN events have no Room ID or password. Players show up at the venue and check in
            there.
          </p>
          <label className={labelClass}>Venue name *</label>
          <input value={value.venueName} onChange={(e) => set({ venueName: e.target.value })} className={inputClass} />
          <label className={labelClass}>Address *</label>
          <input value={value.venueAddress} onChange={(e) => set({ venueAddress: e.target.value })} className={inputClass} />
          <label className={labelClass}>City *</label>
          <input value={value.venueCity} onChange={(e) => set({ venueCity: e.target.value })} className={inputClass} />

          <label className={labelClass}>Check-in opens</label>
          <input type="datetime-local" value={value.checkInOpensAt} onChange={(e) => set({ checkInOpensAt: e.target.value })} className={inputClass} />
          <label className={labelClass}>Check-in closes</label>
          <input type="datetime-local" value={value.checkInClosesAt} onChange={(e) => set({ checkInClosesAt: e.target.value })} className={inputClass} />
          <p className="font-sans text-[11px] text-bk-muted mt-1">
            Players check themselves in during this window with a code you show at the venue.
            You can always check people in by hand.
          </p>
        </>
      )}
    </div>
  );
}

export const emptyVenue: VenueValue = {
  venueType: "online",
  venueName: "",
  venueAddress: "",
  venueCity: "",
  checkInOpensAt: "",
  checkInClosesAt: "",
};

// What the forms send to the API.
export function venueToBody(v: VenueValue) {
  const lan = v.venueType === "lan";
  // Hybrid keeps its venue on the stages, not on the tournament.
  return {
    venueType: v.venueType,
    venueName: lan ? v.venueName : undefined,
    venueAddress: lan ? v.venueAddress : undefined,
    venueCity: lan ? v.venueCity : undefined,
    checkInOpensAt: lan && v.checkInOpensAt ? new Date(v.checkInOpensAt).toISOString() : lan ? null : undefined,
    checkInClosesAt: lan && v.checkInClosesAt ? new Date(v.checkInClosesAt).toISOString() : lan ? null : undefined,
  };
}

// datetime-local wants local time without a zone.
export function toLocalInput(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  const off = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - off).toISOString().slice(0, 16);
}
