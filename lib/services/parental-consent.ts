// Parental consent for players under 18 (see lib/consent.ts for the pure rules).
// Consent belongs to the player, not a tournament: once a guardian approves, it
// covers every tournament that asks for it until `validUntil` (one year).
import { prisma } from "@/lib/prisma";
import {
  CONSENT_LINK_VALID_DAYS,
  CONSENT_MAX_REQUESTS_PER_DAY,
  CONSENT_VALID_DAYS,
  parentalConsentEnabled,
} from "@/lib/consent-config";
import {
  childDisplayName,
  consentNeeded,
  deriveConsentState,
  joinNeedsConsent,
  entryConsentStatus,
  hashConsentToken,
  isPlausibleEmail,
  isValidSignedName,
  maskEmail,
  newConsentToken,
  type ConsentState,
  type EntryConsentStatus,
} from "@/lib/consent";
import { WAIVER_VERSION, waiverText } from "@/lib/consent-waiver";
import { consentApprovedEmail, consentRequestEmail, consentWithdrawnEmail } from "@/lib/email-templates";
import { notify } from "@/lib/services/notifications";
import { savePayoutMethod } from "@/lib/services/payout-methods";
import { openConsentCases } from "@/lib/services/consent-cases";
import { sendEmail } from "@/lib/email";
import { ageOn } from "@/lib/age";
import { ADULT_AGE } from "@/lib/consent-config";

const DAY = 24 * 60 * 60 * 1000;

function siteBase(origin?: string): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? origin ?? "").replace(/\/$/, "");
}

export function supportEmail(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support";
}

// ---- the player's own view -------------------------------------------------

export async function getConsentStateForPlayer(playerId: string, now: Date = new Date()) {
  const records = await prisma.parentalConsent.findMany({
    where: { playerId },
    orderBy: { createdAt: "desc" },
    select: { status: true, validUntil: true, linkExpiresAt: true, decidedAt: true, createdAt: true, revokedAt: true, guardianEmail: true },
  });
  const { state, validUntil } = deriveConsentState(records, now);
  const last = records.find((r) => r.status !== "superseded");
  return {
    state,
    validUntil,
    guardianEmailMasked: last ? maskEmail(last.guardianEmail) : null,
  };
}

type Fail = { error: string; message: string };
const fail = (error: string, message: string): Fail => ({ error, message });

export async function requestConsent(opts: {
  userId: string;
  guardianEmail: string;
  requestedFor?: string | null;
  origin: string;
}) {
  if (!parentalConsentEnabled()) return fail("consent_disabled", "Parental consent isn't switched on yet.");

  const profile = await prisma.playerProfile.findUnique({
    where: { userId: opts.userId },
    include: { user: { select: { email: true } } },
  });
  if (!profile) return fail("not_found", "Player profile not found.");
  if (!profile.birthDate || ageOn(profile.birthDate) >= ADULT_AGE) {
    return fail("not_needed", "Only players under 18 need a parent or guardian's consent.");
  }

  const email = opts.guardianEmail.trim().toLowerCase();
  if (!isPlausibleEmail(email)) return fail("invalid_email", "Enter your parent or guardian's email address.");
  if (profile.user.email && email === profile.user.email.toLowerCase()) {
    return fail("same_email", "Use your parent or guardian's email, not your own.");
  }

  const current = await getConsentStateForPlayer(profile.id);
  if (current.state === "approved") {
    return { data: { state: "approved" as ConsentState, alreadyApproved: true, linkExpiresAt: null as Date | null, testMode: false } };
  }

  const since = new Date(Date.now() - DAY);
  const recent = await prisma.parentalConsent.count({ where: { playerId: profile.id, createdAt: { gte: since } } });
  if (recent >= CONSENT_MAX_REQUESTS_PER_DAY) {
    return fail("too_many", "You've sent a few requests today. Please wait a day, or ask your parent to check their spam folder.");
  }

  const { token, tokenHash } = newConsentToken();
  const linkExpiresAt = new Date(Date.now() + CONSENT_LINK_VALID_DAYS * DAY);

  // A new request replaces any pending one (its old link stops working).
  await prisma.parentalConsent.updateMany({
    where: { playerId: profile.id, status: "pending" },
    data: { status: "superseded" },
  });
  const record = await prisma.parentalConsent.create({
    data: {
      playerId: profile.id,
      guardianEmail: email,
      tokenHash,
      requestedFor: opts.requestedFor?.slice(0, 120) ?? null,
      linkExpiresAt,
    },
  });

  const link = `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? opts.origin}/consent/${token}`;
  const sent = await sendEmail(
    consentRequestEmail({
      to: email,
      childName: childDisplayName(profile.firstName, profile.lastName),
      requestedFor: opts.requestedFor,
      link,
      linkExpiresAt,
    })
  );
  if (!sent.ok) {
    // Nothing reached the guardian, so don't leave a dead request behind.
    await prisma.parentalConsent.delete({ where: { id: record.id } });
    return fail(
      sent.error,
      sent.error === "email_not_configured"
        ? "Email isn't set up yet, so we couldn't send the request. Please try again later."
        : "We couldn't send the email. Check the address and try again."
    );
  }
  return {
    data: { state: "pending" as ConsentState, alreadyApproved: false, linkExpiresAt, testMode: !!sent.redirected },
  };
}

// ---- the guardian's page ---------------------------------------------------

export type ConsentLinkInfo =
  | { ok: true; childName: string; requestedFor: string | null; linkExpiresAt: Date }
  | { ok: false; reason: "not_found" | "expired" | "already_approved" | "already_declined" | "closed"; validUntil?: Date | null };

export async function getConsentLinkInfo(token: string, now: Date = new Date()): Promise<ConsentLinkInfo> {
  const rec = await prisma.parentalConsent.findUnique({
    where: { tokenHash: hashConsentToken(token) },
    include: { player: { select: { firstName: true, lastName: true } } },
  });
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.status === "approved") return { ok: false, reason: "already_approved", validUntil: rec.validUntil };
  if (rec.status === "declined") return { ok: false, reason: "already_declined" };
  if (rec.status !== "pending") return { ok: false, reason: "closed" };
  if (rec.linkExpiresAt <= now) return { ok: false, reason: "expired" };
  return {
    ok: true,
    childName: childDisplayName(rec.player.firstName, rec.player.lastName),
    requestedFor: rec.requestedFor,
    linkExpiresAt: rec.linkExpiresAt,
  };
}

export async function decideConsent(
  token: string,
  input: {
    action: "approve" | "decline";
    signedName?: string;
    confirmGuardian?: boolean;
    agree?: boolean;
    ip?: string | null;
    userAgent?: string | null;
    origin?: string;
  },
  now: Date = new Date()
) {
  const rec = await prisma.parentalConsent.findUnique({
    where: { tokenHash: hashConsentToken(token) },
    include: { player: { select: { firstName: true, lastName: true } } },
  });
  if (!rec) return fail("not_found", "This link isn't valid.");
  if (rec.status !== "pending") return fail("already_used", "This request has already been answered.");
  if (rec.linkExpiresAt <= now) return fail("expired", "This link has expired. Ask your child to send a new request.");

  if (input.action === "decline") {
    const res = await prisma.parentalConsent.updateMany({
      where: { id: rec.id, status: "pending" },
      data: { status: "declined", decidedAt: now, signedIp: input.ip ?? null, signedUserAgent: input.userAgent?.slice(0, 300) ?? null },
    });
    if (res.count === 0) return fail("already_used", "This request has already been answered.");
    return { data: { status: "declined" as const, validUntil: null as Date | null } };
  }

  if (!input.confirmGuardian || !input.agree) {
    return fail("not_confirmed", "Please tick both boxes to approve.");
  }
  const name = (input.signedName ?? "").trim().replace(/\s+/g, " ");
  if (!isValidSignedName(name)) return fail("invalid_name", "Type your full legal name to sign.");
  const childFull = `${rec.player.firstName ?? ""} ${rec.player.lastName ?? ""}`.trim().toLowerCase();
  if (childFull && name.toLowerCase() === childFull) {
    return fail("invalid_name", "The signature must be the parent or guardian's name, not the player's.");
  }

  const validUntil = new Date(now.getTime() + CONSENT_VALID_DAYS * DAY);
  const manage = newConsentToken();
  const res = await prisma.parentalConsent.updateMany({
    where: { id: rec.id, status: "pending" },
    data: {
      manageTokenHash: manage.tokenHash,
      status: "approved",
      decidedAt: now,
      validUntil,
      signedName: name,
      waiverVersion: WAIVER_VERSION,
      waiverText: waiverText(supportEmail()),
      signedIp: input.ip ?? null,
      signedUserAgent: input.userAgent?.slice(0, 300) ?? null,
    },
  });
  if (res.count === 0) return fail("already_used", "This request has already been answered.");

  // Send the guardian a link they can keep: withdraw consent, set where prizes are paid.
  // A failed email never undoes the approval; the page also shows the same link.
  const manageLink = `${siteBase(input.origin)}/consent/manage/${manage.token}`;
  await sendEmail(
    consentApprovedEmail({
      to: rec.guardianEmail,
      childName: childDisplayName(rec.player.firstName, rec.player.lastName),
      manageLink,
      validUntil,
    })
  ).catch(() => undefined);
  return { data: { status: "approved" as const, validUntil, manageToken: manage.token } };
}

// ---- gates and the organizer's column --------------------------------------

// Used before room details and check-in: a player who needs consent for this
// tournament and doesn't have a valid one is held back.
export type ConsentGateResult =
  | { ok: true }
  | { error: "consent_required"; message: string };

export async function checkConsentGate(tournamentId: string, playerId: string): Promise<ConsentGateResult> {
  if (!parentalConsentEnabled()) return { ok: true as const };
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { requireParentalConsent: true },
  });
  if (!t) return { ok: true as const };
  const profile = await prisma.playerProfile.findUnique({ where: { id: playerId }, select: { birthDate: true } });
  if (!consentNeeded(t, profile?.birthDate, true)) return { ok: true as const };
  const { state } = await getConsentStateForPlayer(playerId);
  if (state === "approved") return { ok: true as const };
  return {
    error: "consent_required" as const,
    message: "A parent or guardian needs to approve your participation first. Send them the request from your dashboard.",
  };
}

// registrationId -> status, or null when this tournament doesn't use consent.
export async function consentStatusesForTournament(
  tournamentId: string
): Promise<Record<string, EntryConsentStatus> | null> {
  if (!parentalConsentEnabled()) return null;
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { requireParentalConsent: true },
  });
  if (!t?.requireParentalConsent) return null;

  const regs = await prisma.registration.findMany({
    where: { tournamentId },
    select: {
      id: true,
      player: { select: { id: true, birthDate: true } },
      teamEntry: { select: { members: { select: { player: { select: { id: true, birthDate: true } } } } } },
    },
  });
  const playersOf = (r: (typeof regs)[number]) =>
    r.player ? [r.player] : (r.teamEntry?.members.map((m) => m.player) ?? []);
  const ids = [...new Set(regs.flatMap((r) => playersOf(r).map((p) => p.id)))];
  const records = await prisma.parentalConsent.findMany({
    where: { playerId: { in: ids } },
    select: { playerId: true, status: true, validUntil: true, linkExpiresAt: true, decidedAt: true, createdAt: true, revokedAt: true },
  });
  const byPlayer = new Map<string, typeof records>();
  for (const rec of records) byPlayer.set(rec.playerId, [...(byPlayer.get(rec.playerId) ?? []), rec]);

  const now = new Date();
  const out: Record<string, EntryConsentStatus> = {};
  for (const r of regs) {
    out[r.id] = entryConsentStatus(
      playersOf(r).map((p) => ({
        needed: consentNeeded(t, p.birthDate, true, now),
        state: deriveConsentState(byPlayer.get(p.id) ?? [], now).state,
      }))
    );
  }
  return out;
}


// ---- minors can't join anything until a guardian approves ---------------------

export type JoinGateResult =
  | { ok: true }
  | { error: "consent_required"; message: string; playerId: string };

// Run before ANY entry is created (tournament, scrim, league, challenge). Every player
// on the entry must pass; a teammate's guardian counts the same as your own.
export async function checkJoinGate(playerIds: string[], selfId?: string): Promise<JoinGateResult> {
  if (!parentalConsentEnabled() || playerIds.length === 0) return { ok: true };
  const profiles = await prisma.playerProfile.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, birthDate: true },
  });
  for (const p of profiles) {
    if (!joinNeedsConsent(p.birthDate, true)) continue;
    const { state } = await getConsentStateForPlayer(p.id);
    if (state === "approved") continue;
    const own = !selfId || p.id === selfId;
    return {
      error: "consent_required",
      playerId: p.id,
      message: own
        ? "A parent or guardian needs to approve your account before you can join. You can browse in the meantime. Send them the request from your dashboard."
        : "A player on this entry still needs a parent or guardian's approval before they can join.",
    };
  }
  return { ok: true };
}

// Right after a under-18 player confirms their email, ask the guardian they named on
// the sign-up form. Does nothing if there's no guardian email, the player isn't a minor,
// or a request already exists, so it is safe to call on every login.
export async function requestSignupConsent(userId: string, origin: string) {
  if (!parentalConsentEnabled()) return { skipped: true as const };
  const profile = await prisma.playerProfile.findUnique({
    where: { userId },
    select: { id: true, guardianEmail: true, birthDate: true },
  });
  if (!profile?.guardianEmail || !joinNeedsConsent(profile.birthDate, true)) return { skipped: true as const };
  const { state } = await getConsentStateForPlayer(profile.id);
  if (state !== "none") return { skipped: true as const };
  return requestConsent({ userId, guardianEmail: profile.guardianEmail, requestedFor: null, origin });
}

// ---- the guardian's manage page (the link in the "you approved" email) --------

export type ManageInfo =
  | {
      ok: true;
      childName: string;
      active: boolean; // approved and not lapsed
      status: "approved" | "revoked";
      validUntil: Date | null;
      playerId: string;
      childIsAdult: boolean;
    }
  | { ok: false; reason: "not_found" };

async function findManage(token: string) {
  return prisma.parentalConsent.findUnique({
    where: { manageTokenHash: hashConsentToken(token) },
    include: { player: { select: { id: true, userId: true, firstName: true, lastName: true, birthDate: true } } },
  });
}

export async function getManageInfo(token: string, now: Date = new Date()): Promise<ManageInfo> {
  const rec = await findManage(token);
  if (!rec || (rec.status !== "approved" && rec.status !== "revoked")) return { ok: false, reason: "not_found" };
  return {
    ok: true,
    childName: childDisplayName(rec.player.firstName, rec.player.lastName),
    status: rec.status,
    active: rec.status === "approved" && !!rec.validUntil && rec.validUntil > now,
    validUntil: rec.validUntil,
    playerId: rec.player.id,
    childIsAdult: !!rec.player.birthDate && ageOn(rec.player.birthDate, now) >= ADULT_AGE,
  };
}

// What happens to a child's entries when a guardian withdraws:
//  - entries in tournaments that haven't started are cancelled (the slot reopens)
//  - entries in tournaments already running are left alone but the organizer is told, so
//    they and an admin can decide; results already recorded always stay.
async function applyWithdrawal(player: { id: string; userId: string }, childName: string) {
  const regs = await prisma.registration.findMany({
    where: {
      status: { in: ["pending", "approved"] },
      OR: [{ playerId: player.id }, { teamEntry: { members: { some: { playerId: player.id } } } }],
      tournament: { status: { in: ["published", "registration_open", "registration_closed", "in_progress"] } },
    },
    select: {
      id: true,
      tournamentId: true,
      tournament: { select: { status: true, name: true, organizer: { select: { userId: true } } } },
    },
  });

  const upcoming = regs.filter((r) => r.tournament.status !== "in_progress");
  if (upcoming.length > 0) {
    await prisma.registration.updateMany({
      where: { id: { in: upcoming.map((r) => r.id) } },
      data: { status: "rejected" },
    });
    const { bumpRegistrationCount } = await import("@/lib/services/tournaments");
    for (const tid of new Set(upcoming.map((r) => r.tournamentId))) await bumpRegistrationCount(tid);
  }

  // Entries in a running tournament wait for an admin (Approvals > Guardian withdrawals).
  await openConsentCases(player.id, regs.filter((r) => r.tournament.status === "in_progress"));

  for (const r of regs) {
    const running = r.tournament.status === "in_progress";
    await notify(r.tournament.organizer.userId, {
      type: "consent_withdrawn",
      title: running ? "Guardian consent withdrawn mid-tournament" : "An entry was cancelled",
      body: running
        ? `The guardian of a player (${childName}) in "${r.tournament.name}" withdrew consent. The entry was NOT removed because the tournament is running. An admin will decide whether they can finish, and you will be told.`
        : `The guardian of a player (${childName}) in "${r.tournament.name}" withdrew consent, so the entry was cancelled and the slot reopened.`,
      href: `/organizer/dashboard/tournaments/${r.tournamentId}`,
    });
  }

  await notify(player.userId, {
    type: "consent_withdrawn",
    title: "Your guardian withdrew permission",
    body:
      regs.length > 0
        ? "Your upcoming entries were cancelled. You can still browse, but you can't join anything until your guardian approves again."
        : "You can still browse, but you can't join anything until your guardian approves again.",
    href: "/dashboard",
  });
  return { cancelled: upcoming.length, flagged: regs.length - upcoming.length };
}

export async function withdrawConsent(token: string, now: Date = new Date()) {
  const rec = await findManage(token);
  if (!rec) return fail("not_found", "This link isn't valid.");
  if (rec.status === "revoked") return { data: { alreadyWithdrawn: true as const, cancelled: 0, flagged: 0 } };
  if (rec.status !== "approved") return fail("not_found", "This link isn't valid.");

  const res = await prisma.parentalConsent.updateMany({
    where: { id: rec.id, status: "approved" },
    data: { status: "revoked", revokedAt: now },
  });
  if (res.count === 0) return { data: { alreadyWithdrawn: true as const, cancelled: 0, flagged: 0 } };

  const childName = childDisplayName(rec.player.firstName, rec.player.lastName);
  const effects = await applyWithdrawal({ id: rec.player.id, userId: rec.player.userId }, childName);
  await sendEmail(consentWithdrawnEmail({ to: rec.guardianEmail, childName })).catch(() => undefined);
  return { data: { alreadyWithdrawn: false as const, ...effects } };
}

// The guardian sets where their child's prizes are paid. Only while consent is active.
export async function saveGuardianPayout(token: string, body: unknown, now: Date = new Date()) {
  const rec = await findManage(token);
  if (!rec || rec.status !== "approved" || !rec.validUntil || rec.validUntil <= now) {
    return fail("not_active", "This permission is no longer active, so payment details can't be changed.");
  }
  return savePayoutMethod(rec.player.id, "guardian", body);
}
