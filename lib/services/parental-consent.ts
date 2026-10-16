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
import { consentRequestEmail } from "@/lib/email-templates";
import { sendEmail } from "@/lib/email";
import { ageOn } from "@/lib/age";
import { ADULT_AGE } from "@/lib/consent-config";

const DAY = 24 * 60 * 60 * 1000;

export function supportEmail(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support";
}

// ---- the player's own view -------------------------------------------------

export async function getConsentStateForPlayer(playerId: string, now: Date = new Date()) {
  const records = await prisma.parentalConsent.findMany({
    where: { playerId },
    orderBy: { createdAt: "desc" },
    select: { status: true, validUntil: true, linkExpiresAt: true, decidedAt: true, createdAt: true, guardianEmail: true },
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
  const res = await prisma.parentalConsent.updateMany({
    where: { id: rec.id, status: "pending" },
    data: {
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
  return { data: { status: "approved" as const, validUntil } };
}

// ---- gates and the organizer's column --------------------------------------

// Used before room details and check-in: a player who needs consent for this
// tournament and doesn't have a valid one is held back.
export async function checkConsentGate(tournamentId: string, playerId: string) {
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
    select: { playerId: true, status: true, validUntil: true, linkExpiresAt: true, decidedAt: true, createdAt: true },
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
