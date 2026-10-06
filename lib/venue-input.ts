import type { VenueType } from "@prisma/client";

export interface ParsedVenue {
  venueType?: VenueType;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  checkInOpensAt?: Date | null;
  checkInClosesAt?: Date | null;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

function date(v: unknown): Date | null | undefined | "invalid" {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

// Shared by the create and edit routes. Only shape/length checks here — the
// rules that need the database (locking, "venue required to publish") live in
// the service.
export function parseVenue(
  body: Record<string, unknown>,
  _opts: { partial?: boolean } = {}
): { ok: true; value: ParsedVenue } | { ok: false; message: string } {
  void _opts;
  const out: ParsedVenue = {};

  if (body.venueType !== undefined) {
    if (body.venueType !== "online" && body.venueType !== "lan") {
      return { ok: false, message: "venueType must be online or lan." };
    }
    out.venueType = body.venueType;
  }
  const name = text(body.venueName, 120);
  const address = text(body.venueAddress, 300);
  const city = text(body.venueCity, 80);
  if (name !== undefined) out.venueName = name;
  if (address !== undefined) out.venueAddress = address;
  if (city !== undefined) out.venueCity = city;

  const opens = date(body.checkInOpensAt);
  const closes = date(body.checkInClosesAt);
  if (opens === "invalid" || closes === "invalid") return { ok: false, message: "Check-in times are not valid dates." };
  if (opens !== undefined) out.checkInOpensAt = opens;
  if (closes !== undefined) out.checkInClosesAt = closes;
  if (opens && closes && closes <= opens) return { ok: false, message: "Check-in must close after it opens." };

  return { ok: true, value: out };
}
