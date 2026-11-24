import Module from "node:module";
// Stub next/navigation (these components only use useRouter for refresh/push after an action).
const orig = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (req: unknown, ...rest: unknown[]) {
  if (req === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() };
  return orig.call(this, req, ...rest);
};
import React from "react";
import { renderToString } from "react-dom/server";
// Components rely on the automatic JSX runtime; make the classic one work too, whichever the tsconfig asks for.
(globalThis as { React?: unknown }).React = React;

const iso = (h: number) => new Date(Date.UTC(2026, 11, 1, 10, 0) + h * 3600e3).toISOString();
const seatsFull = {
  hasRooms: true, totalSeats: 6, taken: 6, seatsLeft: 0, waiting: 3, waitlistEnabled: true, full: true,
  rooms: [1, 2, 3].map((n) => ({ id: `r${n}`, number: n, label: `Room ${n}`, startAt: iso(n * 0.5), capacity: 2, taken: 2, seatsLeft: 0 })),
};
const seatsOpen = { ...seatsFull, taken: 4, seatsLeft: 2, full: false, rooms: seatsFull.rooms.map((r, i) => ({ ...r, taken: i === 0 ? 2 : 1, seatsLeft: i === 0 ? 0 : 1 })) };
const manyRooms = { ...seatsOpen, rooms: Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, number: i + 1, label: `Room ${i + 1}`, startAt: iso(i), capacity: 25, taken: i === 0 ? 25 : 3, seatsLeft: i === 0 ? 0 : 22 })) };
const refund = { policy: "full_before_cutoff" as const, cutoffHours: 12, payWindowMinutes: 45 };
const tournament = { entryType: "paid", mode: "solo", customFields: [], paymentInstructions: "Send to JazzCash 0300-1234567", requireParentalConsent: false } as never;

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

(async () => {
  const { default: JoinForm } = await import("../app/(main)/(public)/tournaments/[id]/join/JoinForm");
  const { default: ClubEntryPanel } = await import("../app/(main)/(public)/tournaments/[id]/join/ClubEntryPanel");
  const { default: SeatsPicker } = await import("../components/tournaments/SeatsPicker");
  const { default: SeatsFields } = await import("../components/tournaments/SeatsFields");
  const { default: RoomsPanel } = await import("../components/tournaments/RoomsPanel");
  const { default: RefundsPanel } = await import("../components/tournaments/RefundsPanel");
  const { default: RoomsOverview } = await import("../components/tournaments/RoomsOverview");
  const { default: MyEntryPanel } = await import("../components/tournaments/MyEntryPanel");
  const { DEFAULT_SEAT_FORM } = await import("../lib/seat-form");

  // --- join form, every room full: waiting list, no payment asked
  let h = text(renderToString(<JoinForm tournamentId="t" tournament={tournament} slug="s" startAt={iso(0)} seats={seatsFull} refund={refund} />));
  ok("full: says every seat is taken", h.includes("Every seat is taken"));
  ok("full: button offers the waiting list", h.includes("Join the waiting list"));
  ok("full: no payment fields shown", !h.includes("Upload payment screenshot") && !h.includes("Transaction ID"));
  ok("full: no room picker", !h.includes("Choose your room"));
  ok("full: refund policy + acknowledgement", h.includes("Refund policy") && h.includes("at least 12 hours") && h.includes("agree to it"));
  ok("full: tells them they pay only after a seat opens", h.includes("pay nothing now"));
  // --- join form, seats open
  h = text(renderToString(<JoinForm tournamentId="t" tournament={tournament} slug="s" startAt={iso(0)} seats={seatsOpen} refund={refund} />));
  ok("open: room picker with seats left", h.includes("Choose your room") && h.includes("Any room") && h.includes("1 seat left") && h.includes("Full"));
  ok("open: payment fields present and button is Submit", h.includes("Upload payment screenshot") && h.includes("Submit registration") && h.includes("JazzCash"));
  ok("open: the 45-minute pay window is explained", h.includes("45 minutes"));
  // --- free tournament, no refund block
  h = text(renderToString(<JoinForm tournamentId="t" tournament={{ ...(tournament as object), entryType: "free" } as never} slug="s" startAt={iso(0)} seats={seatsOpen} refund={refund} />));
  ok("free: no refund policy, no payment", !h.includes("Refund policy") && !h.includes("Transaction ID"));
  // --- no seats info at all (older tournaments)
  h = text(renderToString(<JoinForm tournamentId="t" tournament={tournament} slug="s" startAt={null} seats={null} refund={refund} />));
  ok("no seat info: behaves like before (payment + submit)", h.includes("Transaction ID") && h.includes("Submit registration") && !h.includes("Choose your room"));

  // --- many rooms use a dropdown
  const sp = text(renderToString(<SeatsPicker seats={manyRooms} value="" onChange={() => {}} fallbackStart={iso(0)} inputClass="x" />));
  ok("many rooms: dropdown, full room disabled, count of open rooms", sp.includes("Any room") && sp.includes("11 of 12 rooms have seats"));
  const spRaw = renderToString(<SeatsPicker seats={manyRooms} value="" onChange={() => {}} fallbackStart={iso(0)} inputClass="x" />);
  ok("many rooms: the full room option is disabled", /<option value="m0" disabled/.test(spRaw));
  const sp2 = renderToString(<SeatsPicker seats={seatsOpen} value="r2" onChange={() => {}} fallbackStart={iso(0)} inputClass="x" />);
  ok("few rooms: radio list, selected one marked, full one disabled", sp2.includes('role="radiogroup"') && /aria-checked="true"[^>]*>[^]*?Room 2/.test(sp2) && /disabled=""[^>]*>[^]*?Room 1/.test(sp2));
  ok("no rooms: renders nothing", renderToString(<SeatsPicker seats={{ ...seatsOpen, hasRooms: false, rooms: [] }} value="" onChange={() => {}} fallbackStart={null} inputClass="x" />) === "");

  // --- overview
  const ov = text(renderToString(<RoomsOverview seats={seatsOpen} fallbackStart={iso(0)} />));
  ok("overview lists rooms with seats and bars", ov.includes("Room 1") && ov.includes("Full") && ov.includes("2 seats left") === false && ov.includes("1 seat left") && ov.includes("2 / 2") && ov.includes("1 / 2"));
  ok("overview hidden for a single room", renderToString(<RoomsOverview seats={{ ...seatsOpen, rooms: [seatsOpen.rooms[0]] }} fallbackStart={null} />) === "");

  // --- organizer form fields
  const pubg = { name: "PUBG Mobile", maxPerMatch: 25, teamSizeMax: 4, matchLimitNote: "100 players, squads of 4." };
  const f = text(renderToString(<SeatsFields value={{ ...DEFAULT_SEAT_FORM, useRooms: true, perRoom: "30", roomCount: "4" }} onChange={() => {}} paid game={pubg} inputClass="i" labelClass="l" />));
  ok("form: game size hint", f.includes("PUBG Mobile: a room usually holds 25 teams"));
  ok("form: exceeding the size shows the warning and total", f.includes("normally hold 25 teams") && f.includes("30 is above") && f.includes("120"));
  ok("form: waiting list, pay window and refund policies for paid", f.includes("Waiting list") && f.includes("Minutes to pay after a seat opens") && f.includes("No refunds") && f.includes("Refund only if the seat is taken"));
  const f2 = text(renderToString(<SeatsFields value={{ ...DEFAULT_SEAT_FORM }} onChange={() => {}} paid={false} game={{ name: "Tekken 8", maxPerMatch: 2, teamSizeMax: 1 }} inputClass="i" labelClass="l" />));
  ok("form: head-to-head game: no rooms option, explained", f2.includes("played one side against another") && !f2.includes("Several rooms") && f2.includes("Max players") && !f2.includes("Refund policy"));

  // --- organizer panels
  const settings = { waitlistEnabled: true, payWindowMinutes: 45, refundPolicy: "no_refund" as const, refundCutoffHours: 24 };
  const rp = text(renderToString(<RoomsPanel tournamentId="t" seats={seatsOpen} settings={settings} paid refundLocked editable game={pubg} tournamentStart={iso(0)} />));
  ok("rooms panel: totals and waiting", rp.includes("4 / 6 seats taken") && rp.includes("3 waiting") && rp.includes("across 3 rooms"));
  ok("rooms panel: refund policy locked once teams entered", rp.includes("can no longer change"));
  ok("rooms panel: add rooms and waiting-list setting", rp.includes("Add rooms") && rp.includes("Waiting list"));
  const rows = [
    { id: "a", name: "Team A", refundStatus: "requested" as const, statusLabel: "Waiting for the organizer", hadSeat: true, room: "Room 1", amount: "PKR 500", paymentReference: "TXN1", payerName: "Ali", withdrawnAt: iso(0), withdrawReason: "exam" },
    { id: "b", name: "Team B", refundStatus: "owed" as const, statusLabel: "Refund on its way", hadSeat: false, room: null, amount: "PKR 500", paymentReference: null, payerName: null, withdrawnAt: iso(1), withdrawReason: null },
    { id: "c", name: "Team C", refundStatus: "refunded" as const, statusLabel: "Refunded", hadSeat: true, room: "Room 2", amount: "PKR 500", paymentReference: "TXN3", payerName: "Sara", withdrawnAt: iso(2), withdrawReason: null },
  ];
  const rf = text(renderToString(<RefundsPanel rows={rows} policy="organizer_decides" cutoffHours={24} />));
  ok("refunds: counts waiting and to-send", rf.includes("1 waiting for your decision") && rf.includes("1 to send"));
  ok("refunds: shows payer, reference, reason, no-seat note", rf.includes("Paid by Ali") && rf.includes("Transaction TXN1") && rf.includes("exam") && rf.includes("Never got a seat"));
  ok("refunds: right buttons per state", rf.includes("Approve refund") && rf.includes("Decline") && rf.includes("I sent the refund"));
  ok("refunds: empty list renders nothing", renderToString(<RefundsPanel rows={[]} policy="no_refund" cutoffHours={1} />) === "");

  // --- the player's panel renders nothing until data loads (no crash on the server)
  ok("my entry: nothing before it loads", renderToString(<MyEntryPanel tournamentId="t" />) === "");

  // --- club panel renders nothing until options load
  ok("club panel: nothing before options load", renderToString(<ClubEntryPanel tournamentId="t" tournament={{ entryType: "paid", paymentInstructions: null, customFields: [] }} slug="s" seats={seatsFull} refund={refund} />) === "");

  console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
