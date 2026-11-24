// Multi-session bookings for scrim series. A player (or a club's team) picks several sessions of a
// series and pays ONCE. Each session is still an ordinary Registration (rooms, results and disputes
// work as usual); the SeriesBooking groups them and holds the single payment proof.
//
// When the organizer can't run a session, every PAID entry in it asks its payer to choose: move to
// the next session, or take a refund. If they don't choose in time (CHOICE_HOURS), they are moved to
// the next session; if there is none, it becomes a refund. Refunds use the existing refund tracking
// (the organizer refunds directly and confirms; an unconfirmed refund becomes a payout hold).
import { prisma } from "@/lib/prisma";
import { notify, notifyMany } from "@/lib/services/notifications";
import { approveRegistration, registerForTournament } from "@/lib/services/tournaments";
import { resolveTeamActor, submitClubTeamEntry } from "@/lib/services/club-entries";
import { getTrustConfig } from "@/lib/services/organizer-trust";
import { formatMoney } from "@/lib/money";
import { entryAmount } from "@/lib/registration-amount";
import { settleRefundsIfDone } from "@/lib/services/refund-settlement";
import { MAX_BOOKING_SESSIONS as MAX_SESSIONS, priceBooking, validateDiscountTiers } from "@/lib/scrim-series-rules";

export const MAX_BOOKING_SESSIONS = MAX_SESSIONS;
export const CHOICE_HOURS = 48;
const OPEN = ["published", "registration_open"] as const;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

type Err = { error: string; message?: string };
const fail = (error: string, message?: string): Err => ({ error, message });
const when = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "");

// ------------------------------------------------------------
// Book several sessions with one payment
// ------------------------------------------------------------
export async function createBooking(
  userId: string,
  seriesSlug: string,
  input: { sessionIds: unknown; teamId?: unknown; memberPlayerIds?: unknown; paymentProofUrl?: unknown; paymentReference?: unknown },
  now = new Date()
) {
  const series = await prisma.scrimSeries.findUnique({ where: { slug: seriesSlug }, include: { organizer: { select: { userId: true } } } });
  if (!series) return fail("not_found", "Series not found.");
  if (series.status === "ended") return fail("series_ended", "This series has ended.");

  const ids = Array.isArray(input.sessionIds) ? [...new Set(input.sessionIds.filter((x): x is string => typeof x === "string"))] : [];
  if (ids.length === 0) return fail("validation_error", "Choose at least one session.");
  if (ids.length > MAX_BOOKING_SESSIONS) return fail("validation_error", `You can book up to ${MAX_BOOKING_SESSIONS} sessions at once.`);

  const sessions = await prisma.tournament.findMany({
    where: { id: { in: ids }, seriesId: series.id },
    orderBy: { startAt: "asc" },
    select: { id: true, name: true, startAt: true, status: true },
  });
  if (sessions.length !== ids.length) return fail("invalid_sessions", "Some of those sessions don't belong to this series.");
  const closed = sessions.find((s) => !(OPEN as readonly string[]).includes(s.status) || !s.startAt || s.startAt <= now);
  if (closed) return fail("invalid_sessions", `${closed.name} isn't open for sign-up any more.`);

  const paid = series.entryType === "paid";
  const proof = typeof input.paymentProofUrl === "string" && input.paymentProofUrl ? input.paymentProofUrl : undefined;
  const reference = typeof input.paymentReference === "string" && input.paymentReference.trim() ? input.paymentReference.trim() : undefined;
  if (paid && !proof) return fail("payment_proof_required", "Upload proof of payment.");
  if (paid && !reference) return fail("payment_reference_required", "Enter the transaction ID from your payment receipt.");

  const team = series.mode !== "solo";
  let playerId: string | null = null;
  let teamId: string | null = null;
  let memberIds: string[] = [];
  if (team) {
    if (typeof input.teamId !== "string" || !Array.isArray(input.memberPlayerIds) || input.memberPlayerIds.length === 0) {
      return fail("team_required", "Choose your club team and the players in it.");
    }
    teamId = input.teamId;
    memberIds = input.memberPlayerIds.filter((x): x is string => typeof x === "string");
    const actor = await resolveTeamActor(userId, teamId);
    if ("error" in actor) return fail("not_authorized", "Only a member of this club can book for its team.");
  } else {
    const profile = await prisma.playerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) return fail("no_player_profile", "Complete your player profile first.");
    playerId = profile.id;
  }

  // What this booking costs: the list price for each session, less the discount for booking this many.
  const tiers = validateDiscountTiers(series.discountTiers);
  const price = paid ? priceBooking(Number(series.entryFeeAmount!.toString()), sessions.length, tiers.ok ? tiers.value : []) : null;

  const booking = await prisma.seriesBooking.create({
    data: {
      seriesId: series.id, userId, clubTeamId: teamId, paymentProofUrl: proof ?? null, paymentReference: reference ?? null,
      feePerSession: paid ? series.entryFeeAmount : null, currency: paid ? series.entryFeeCurrency : null, sessionCount: sessions.length,
      discountPercent: price?.percentOff ?? 0, totalAmount: price?.total ?? null,
    },
  });

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const bk = { id: booking.id, checkProof: i === 0 }; // one duplicate-screenshot check per booking
    const res = team
      ? await submitClubTeamEntry(userId, s.id, teamId!, memberIds, { paymentProofUrl: proof, paymentReference: reference, booking: bk })
      : await registerForTournament({ tournamentId: s.id, playerId: playerId!, paymentProofUrl: proof, paymentReference: reference, payerUserId: userId, booking: bk });
    if ("error" in res) {
      await undoBooking(booking.id);
      return fail(String(res.error), `${s.name}: ${("message" in res && res.message) || "couldn't be booked."} Nothing was booked.`);
    }
    // A full session puts a normal entry on its waiting list. A paid booking must not: refuse it whole.
    if (res.data.status === "waitlisted") {
      await undoBooking(booking.id);
      return fail("session_full", `${s.name} is full. Pick a different session. Nothing was booked.`);
    }
    // Remember what was actually paid for THIS session, so a refund returns exactly that.
    if (price) await prisma.registration.update({ where: { id: res.data.id }, data: { paidAmount: price.perSession[i] } });
  }

  if (team && series.organizer.userId !== userId) {
    const club = await prisma.clubTeam.findUnique({ where: { id: teamId! }, select: { name: true, club: { select: { userId: true } } } });
    if (club && club.club.userId !== userId) {
      await notify(club.club.userId, {
        type: "club", title: "A club member booked sessions", body: `${club.name} was booked for ${sessions.length} session${sessions.length === 1 ? "" : "s"} of ${series.name}.`, href: "/club/dashboard",
      }).catch(() => undefined);
    }
  }
  await notify(series.organizer.userId, {
    type: "booking", title: "New booking to review",
    body: `${sessions.length} session${sessions.length === 1 ? "" : "s"} of ${series.name}${price ? `, ${formatMoney(price.total, series.entryFeeCurrency!)} paid${price.percentOff ? ` (${price.percentOff}% discount)` : ""}` : ""}.`,
    href: "/organizer/dashboard/scrims",
  }).catch(() => undefined);
  return {
    data: {
      bookingId: booking.id, sessions: sessions.length,
      total: price?.total ?? 0, currency: paid ? series.entryFeeCurrency : null, discountPercent: price?.percentOff ?? 0, saved: price?.saved ?? 0,
    },
  };
}

/** Remove one entry completely (used to undo a booking, or an attempt that landed on a waiting list). */
async function removeRegistration(r: { id: string; tournamentId: string; teamEntryId: string | null }) {
  await prisma.proofFingerprint.deleteMany({ where: { kind: "registration", refId: r.id } });
  await prisma.registration.delete({ where: { id: r.id } });
  if (r.teamEntryId) {
    await prisma.teamMember.deleteMany({ where: { teamEntryId: r.teamEntryId } });
    await prisma.teamEntry.delete({ where: { id: r.teamEntryId } });
  }
  await prisma.tournament.update({ where: { id: r.tournamentId }, data: { registrationCount: { decrement: 1 } } }).catch(() => undefined);
}

/** Remove a half-made booking completely (nothing was booked, nothing is charged). */
async function undoBooking(bookingId: string) {
  const regs = await prisma.registration.findMany({ where: { bookingId }, select: { id: true, tournamentId: true, teamEntryId: true } });
  for (const r of regs) await removeRegistration(r);
  await prisma.seriesBooking.delete({ where: { id: bookingId } }).catch(() => undefined);
}

// ------------------------------------------------------------
// The organizer approves or rejects a whole booking
// ------------------------------------------------------------
async function organizerBooking(userId: string, bookingId: string) {
  const b = await prisma.seriesBooking.findUnique({ where: { id: bookingId }, include: { series: { include: { organizer: { select: { id: true, userId: true } } } } } });
  if (!b) return fail("not_found");
  if (b.series.organizer.userId !== userId) return fail("forbidden");
  if (b.status !== "pending") return fail("invalid_status", `This booking is already ${b.status}.`);
  return { booking: b };
}

export async function approveBooking(userId: string, bookingId: string) {
  const r = await organizerBooking(userId, bookingId);
  if ("error" in r) return r;
  const b = r.booking;
  const host = await prisma.institution.findUnique({ where: { organizerId: b.series.organizer.id }, select: { id: true } });
  const regs = await prisma.registration.findMany({ where: { bookingId, status: "pending" }, select: { id: true, paymentStatus: true } });
  const now = new Date();
  await prisma.$transaction([
    prisma.registration.updateMany({ where: { bookingId, status: "pending", paymentStatus: "unpaid" }, data: { status: "approved", approvedAt: now, approvedByInstitutionId: host?.id ?? null, paymentStatus: "paid" } }),
    prisma.registration.updateMany({ where: { bookingId, status: "pending", paymentStatus: { not: "unpaid" } }, data: { status: "approved", approvedAt: now, approvedByInstitutionId: host?.id ?? null } }),
    prisma.seriesBooking.update({ where: { id: bookingId }, data: { status: "approved" } }),
  ]);
  await notify(b.userId, {
    type: "booking", title: "Your booking was approved",
    body: `${regs.length} session${regs.length === 1 ? "" : "s"} of ${b.series.name} are confirmed. Room details appear before each session.`, href: "/bookings",
  }).catch(() => undefined);
  return { data: { approved: regs.length } };
}

export async function rejectBooking(userId: string, bookingId: string, reason?: unknown) {
  const r = await organizerBooking(userId, bookingId);
  if ("error" in r) return r;
  const b = r.booking;
  const why = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;
  const regs = await prisma.registration.updateMany({ where: { bookingId, status: "pending" }, data: { status: "rejected" } });
  await prisma.seriesBooking.update({ where: { id: bookingId }, data: { status: "rejected" } });
  await notify(b.userId, {
    type: "booking", title: "Your booking wasn't approved",
    body: `${b.series.name}: ${why ?? "the organizer could not confirm the payment."}`, href: "/bookings",
  }).catch(() => undefined);
  return { data: { rejected: regs.count } };
}

// ------------------------------------------------------------
// The organizer can't run a session
// ------------------------------------------------------------
export async function cancelSeriesSession(userId: string, tournamentId: string, reason?: unknown, now = new Date()) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId }, include: { series: { include: { organizer: { select: { userId: true } } } } },
  });
  if (!t || !t.series) return fail("not_a_series_session", "This isn't a session of a recurring series.");
  if (t.series.organizer.userId !== userId) return fail("forbidden");
  if (!(OPEN as readonly string[]).includes(t.status)) return fail("invalid_status", "This session can't be cancelled any more.");

  // Money that hasn't been confirmed yet makes the refund question unclear: settle it first.
  const unconfirmed = await prisma.registration.count({ where: { tournamentId, status: "pending", paymentStatus: "unpaid", paymentProofUrl: { not: null } } });
  if (unconfirmed > 0) {
    return fail("pending_payments", `${unconfirmed} payment${unconfirmed === 1 ? " is" : "s are"} still waiting for your review. Approve or reject ${unconfirmed === 1 ? "it" : "them"} first.`);
  }

  const regs = await prisma.registration.findMany({
    where: { tournamentId, status: { in: ["pending", "approved", "waitlisted"] } },
    select: { id: true, status: true, paymentStatus: true, payerUserId: true, player: { select: { userId: true } }, teamEntry: { select: { members: { select: { player: { select: { userId: true } } } } } } },
  });
  const deadline = new Date(now.getTime() + CHOICE_HOURS * HOUR);
  const owing = regs.filter((r) => r.status === "approved" && r.paymentStatus === "paid");
  await prisma.$transaction([
    prisma.tournament.update({ where: { id: tournamentId }, data: { status: "cancelled" } }),
    prisma.registration.updateMany({ where: { id: { in: owing.map((r) => r.id) } }, data: { choiceStatus: "pending", choiceDeadline: deadline } }),
  ]);

  const why = typeof reason === "string" && reason.trim() ? ` Reason: ${reason.trim().slice(0, 300)}` : "";
  const owingPayers = new Set<string>();
  for (const r of owing) { const u = r.payerUserId ?? r.player?.userId; if (u) owingPayers.add(u); }
  await notifyMany([...owingPayers], {
    type: "booking", title: "A session you paid for was cancelled",
    body: `${t.name} can't go ahead.${why} Choose by ${when(deadline)}: move to the next session, or get a refund. If you don't choose, you'll be moved to the next session.`, href: "/bookings",
  }).catch(() => undefined);
  const others = new Set<string>();
  for (const r of regs) {
    if (owing.includes(r)) continue;
    if (r.player?.userId) others.add(r.player.userId);
    for (const m of r.teamEntry?.members ?? []) others.add(m.player.userId);
    if (r.payerUserId) others.add(r.payerUserId);
  }
  for (const u of owingPayers) others.delete(u);
  await notifyMany([...others], { type: "booking", title: "A session was cancelled", body: `${t.name} can't go ahead.${why}`, href: `/scrims/${t.series.slug}` }).catch(() => undefined);
  return { data: { needChoice: owing.length, notified: owingPayers.size + others.size } };
}

// ------------------------------------------------------------
// The player's choice: next session or refund
// ------------------------------------------------------------
type CancelledReg = NonNullable<Awaited<ReturnType<typeof loadCancelled>>>;
const loadCancelled = (id: string) => prisma.registration.findUnique({
  where: { id },
  include: {
    tournament: { include: { series: { select: { id: true, name: true, slug: true, organizerId: true, organizer: { select: { userId: true } } } } } },
    player: { select: { id: true, userId: true } },
    teamEntry: { select: { clubTeamId: true, members: { select: { playerId: true } } } },
  },
});

/** Later sessions still open, not full, and not already booked by this player or team, soonest first. */
async function findNextSessions(reg: CancelledReg, now: Date, limit = 5) {
  const t = reg.tournament;
  const after = t.startAt && t.startAt > now ? t.startAt : now;
  const candidates = await prisma.tournament.findMany({
    where: { seriesId: t.seriesId, id: { not: t.id }, status: { in: [...OPEN] }, startAt: { gt: after } },
    orderBy: { startAt: "asc" }, take: 25,
    select: { id: true, name: true, startAt: true, maxTeams: true, _count: { select: { registrations: { where: { status: { in: ["pending", "approved"] } } } } } },
  });
  const out = [];
  for (const c of candidates) {
    if (c._count.registrations >= c.maxTeams) continue;
    const memberIds = reg.teamEntry?.members.map((m) => m.playerId) ?? (reg.playerId ? [reg.playerId] : []);
    const taken = await prisma.registration.findFirst({
      where: {
        tournamentId: c.id, status: { notIn: ["rejected", "withdrawn"] },
        OR: [
          ...(reg.teamEntry?.clubTeamId ? [{ teamEntry: { clubTeamId: reg.teamEntry.clubTeamId } }] : []),
          ...(reg.playerId ? [{ playerId: reg.playerId }] : []),
          { teamEntry: { members: { some: { playerId: { in: memberIds } } } } },
        ],
      },
      select: { id: true },
    });
    if (!taken) out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
const findNextSession = async (reg: CancelledReg, now: Date) => (await findNextSessions(reg, now, 1))[0] ?? null;

async function carryOver(reg: CancelledReg, now: Date) {
  const series = reg.tournament.series;
  if (!series) return fail("not_a_series_session");
  const payer = reg.payerUserId ?? reg.player?.userId ?? null;
  if (!payer) return fail("no_payer");
  // Claim the choice first, so a double click (or the daily job racing the player) can't move them twice.
  const claimed = await prisma.registration.updateMany({ where: { id: reg.id, choiceStatus: "pending" }, data: { choiceStatus: "moved" } });
  if (claimed.count === 0) return fail("already_chosen", "This was already decided.");
  const release = () => prisma.registration.update({ where: { id: reg.id }, data: { choiceStatus: "pending" } });

  const candidates = await findNextSessions(reg, now);
  if (candidates.length === 0) { await release(); return fail("no_next_session", "There is no later session to move you to."); }

  const opts = { paymentProofUrl: reg.paymentProofUrl ?? undefined, paymentReference: reg.paymentReference ?? undefined, booking: { id: reg.bookingId ?? undefined, checkProof: false } };
  let created: { id: string } | null = null;
  let next = candidates[0];
  let lastError: Err | null = null;
  for (const c of candidates) {
    let made: { id: string; status: string; tournamentId: string; teamEntryId: string | null } | null = null;
    if (reg.teamEntry?.clubTeamId) {
      const res = await submitClubTeamEntry(payer, c.id, reg.teamEntry.clubTeamId, reg.teamEntry.members.map((m) => m.playerId), opts);
      if ("error" in res) { lastError = fail(String(res.error), "message" in res ? (res.message as string | undefined) : undefined); continue; }
      made = res.data;
    } else if (reg.playerId) {
      const res = await registerForTournament({ tournamentId: c.id, playerId: reg.playerId, payerUserId: payer, ...opts });
      if ("error" in res) { lastError = fail(String(res.error), "message" in res ? (res.message as string | undefined) : undefined); continue; }
      made = res.data;
    } else {
      await release();
      return fail("unsupported_entry");
    }
    // That session filled up meanwhile and put the entry on a waiting list: undo it and try the next one.
    if (made.status === "waitlisted") { await removeRegistration(made); continue; }
    created = made; next = c;
    break;
  }
  if (!created) { await release(); return lastError ?? fail("no_next_session", "There is no later session to move you to."); }

  // The payment was already confirmed for the cancelled session, so the new entry is confirmed too.
  await approveRegistration(created.id, series.organizerId);
  await prisma.$transaction([
    prisma.registration.update({ where: { id: created.id }, data: { carriedFromId: reg.id, paidAmount: reg.paidAmount } }),
    prisma.registration.update({ where: { id: reg.id }, data: { choiceDeadline: null } }),
  ]);
  await settleRefundsIfDone(reg.tournamentId);
  await notify(payer, { type: "booking", title: "You were moved to the next session", body: `${reg.tournament.name} was cancelled. You're now in ${next.name} (${when(next.startAt)}).`, href: "/bookings" }).catch(() => undefined);
  return { data: { registrationId: created.id, tournamentId: next.id, name: next.name, startAt: next.startAt } };
}

async function takeRefund(reg: CancelledReg, now: Date, auto = false) {
  // The entry becomes a withdrawn entry with a refund owed, so it shows up in the organizer's usual
  // refund list ("mark refunded") and the player sees its refund status like any other refund.
  const claimed = await prisma.registration.updateMany({
    where: { id: reg.id, choiceStatus: "pending" },
    data: { choiceStatus: "refund", choiceDeadline: null, status: "withdrawn", withdrawnAt: now, withdrawReason: "The organizer cancelled this session", refundStatus: "owed", refundDecidedAt: now },
  });
  if (claimed.count === 0) return fail("already_chosen", "This was already decided.");
  const cfg = await getTrustConfig();
  await prisma.tournament.update({ where: { id: reg.tournamentId }, data: { cancelRefundsDueAt: new Date(now.getTime() + cfg.payoutGraceDays * DAY), refundsConfirmedAt: null } });
  const payer = reg.payerUserId ?? reg.player?.userId ?? null;
  const paidFor = entryAmount(reg, reg.tournament);
  const fee = paidFor !== null ? formatMoney(paidFor, reg.tournament.entryFeeCurrency ?? "USD") : "the entry fee";
  if (reg.tournament.series) {
    await notify(reg.tournament.series.organizer.userId, {
      type: "booking", title: "A player asked for a refund",
      body: `${reg.tournament.name}: ${fee} to refund${auto ? " (no later session was available)" : ""}. Send it directly, then confirm on the session page.`, href: `/organizer/dashboard/tournaments/${reg.tournamentId}`,
    }).catch(() => undefined);
  }
  if (payer) {
    await notify(payer, {
      type: "booking", title: "Refund requested",
      body: `${reg.tournament.name}: the organizer will refund ${fee}${auto ? " because there was no later session to move you to" : ""}. Open a payment dispute if it doesn't arrive in time.`, href: "/bookings",
    }).catch(() => undefined);
  }
  return { data: { choice: "refund" as const } };
}

export async function chooseForCancelled(userId: string, registrationId: string, choice: unknown, now = new Date()) {
  const reg = await loadCancelled(registrationId);
  if (!reg || !reg.tournament.seriesId) return fail("not_found");
  if ((reg.payerUserId ?? reg.player?.userId) !== userId) return fail("forbidden");
  if (reg.choiceStatus !== "pending") return fail("already_chosen", "This was already decided.");
  if (choice === "refund") return takeRefund(reg, now);
  if (choice === "next") return carryOver(reg, now);
  return fail("validation_error", "Choose next session or refund.");
}

/** Daily job: anyone who didn't choose in time is moved to the next session, or refunded if there is none. */
export async function processExpiredChoices(now = new Date()) {
  const due = await prisma.registration.findMany({ where: { choiceStatus: "pending", choiceDeadline: { lte: now } }, select: { id: true }, take: 200 });
  let moved = 0, refunds = 0, failed = 0;
  for (const d of due) {
    try {
      const reg = await loadCancelled(d.id);
      if (!reg || reg.choiceStatus !== "pending") continue;
      const r = await carryOver(reg, now);
      if (!("error" in r)) { moved++; continue; }
      const f = await takeRefund(reg, now, true);
      if ("error" in f) failed++; else refunds++;
    } catch {
      failed++;
    }
  }
  return { checked: due.length, moved, refunds, failed };
}

// ------------------------------------------------------------
// Reading
// ------------------------------------------------------------
export async function listMyChoices(userId: string, now = new Date()) {
  const regs = await prisma.registration.findMany({
    where: { choiceStatus: "pending", OR: [{ payerUserId: userId }, { payerUserId: null, player: { userId } }] },
    orderBy: { choiceDeadline: "asc" },
    select: { id: true },
  });
  const out = [];
  for (const r of regs) {
    const reg = await loadCancelled(r.id);
    if (!reg) continue;
    const next = await findNextSession(reg, now);
    out.push({
      registrationId: reg.id, sessionName: reg.tournament.name, seriesName: reg.tournament.series?.name ?? "",
      deadline: reg.choiceDeadline, fee: entryAmount(reg, reg.tournament), currency: reg.tournament.entryFeeCurrency,
      next: next ? { name: next.name, startAt: next.startAt } : null,
    });
  }
  return out;
}

export async function listMyBookings(userId: string) {
  const rows = await prisma.seriesBooking.findMany({
    where: { userId }, orderBy: { createdAt: "desc" }, take: 50,
    include: {
      series: { select: { name: true, slug: true } },
      registrations: { orderBy: { tournament: { startAt: "asc" } }, select: { id: true, status: true, choiceStatus: true, carriedFromId: true, tournament: { select: { slug: true, name: true, startAt: true, status: true } } } },
    },
  });
  return rows.map((b) => ({
    id: b.id, status: b.status, createdAt: b.createdAt, series: b.series, sessionCount: b.sessionCount,
    total: b.totalAmount ? Number(b.totalAmount.toString()) : b.feePerSession ? Number(b.feePerSession.toString()) * b.sessionCount : 0, discountPercent: b.discountPercent, currency: b.currency,
    sessions: b.registrations.map((r) => ({ registrationId: r.id, slug: r.tournament.slug, name: r.tournament.name, startAt: r.tournament.startAt, tournamentStatus: r.tournament.status, status: r.status, choice: r.choiceStatus, carriedOver: !!r.carriedFromId })),
  }));
}

export async function listPendingBookingsForOrganizer(userId: string) {
  const rows = await prisma.seriesBooking.findMany({
    where: { status: "pending", series: { organizer: { userId } } }, orderBy: { createdAt: "asc" },
    include: { series: { select: { name: true } }, registrations: { select: { id: true }, take: 1 } },
  });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true, email: true } });
  const by = new Map(users.map((u) => [u.id, u]));
  return rows.map((b) => ({
    id: b.id, series: b.series.name, sessionCount: b.sessionCount, createdAt: b.createdAt, reference: b.paymentReference,
    total: b.totalAmount ? Number(b.totalAmount.toString()) : b.feePerSession ? Number(b.feePerSession.toString()) * b.sessionCount : 0, discountPercent: b.discountPercent, currency: b.currency,
    payer: by.get(b.userId)?.displayName ?? "Player", payerEmail: by.get(b.userId)?.email ?? null,
    proofRegistrationId: b.paymentProofUrl ? b.registrations[0]?.id ?? null : null,
  }));
}

/** Refunds for a cancelled session: one line per entry (a team is one line), to the person who PAID. */
export async function listRefundsOwed(userId: string, tournamentId: string) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { organizer: { select: { userId: true } }, entryFeeAmount: true, entryFeeCurrency: true } });
  if (!t || t.organizer.userId !== userId) return null;
  const regs = await prisma.registration.findMany({
    where: { tournamentId, choiceStatus: "refund" },
    orderBy: { withdrawnAt: "asc" },
    select: { id: true, refundStatus: true, paidAmount: true, paymentReference: true, payerUserId: true, player: { select: { userId: true, firstName: true, lastName: true } }, teamEntry: { select: { name: true } } },
  });
  const ids = regs.map((r) => r.payerUserId ?? r.player?.userId).filter((x): x is string => !!x);
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, email: true, phone: true } });
  const by = new Map(users.map((u) => [u.id, u]));
  const waiting = await prisma.registration.count({ where: { tournamentId, choiceStatus: "pending" } });
  return {
    waiting,
    currency: t.entryFeeCurrency,
    items: regs.map((r) => {
      const u = by.get(r.payerUserId ?? r.player?.userId ?? "");
      return {
        id: r.id, refundStatus: r.refundStatus as string, amount: entryAmount(r, t),
        entry: r.teamEntry?.name ?? (r.player ? `${r.player.firstName} ${r.player.lastName}` : "Player"),
        payer: u?.displayName ?? "", email: u?.email ?? null, phone: u?.phone ?? null, reference: r.paymentReference,
      };
    }),
  };
}
