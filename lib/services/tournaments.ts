// Shared service layer for tournament reads/writes.
//
// Both the /api route handlers (the contract mobile will eventually consume)
// and the Next.js Server Components (web pages) call these same functions —
// the web app avoids a wasteful self-fetch over HTTP, while the exposed
// route handlers give mobile/external clients the identical logic.
// Business rules live here ONCE, not duplicated between a page and a route.

import { gameVisibilityWhere } from "@/lib/game-region";
import { checkConsentGate } from "@/lib/services/parental-consent";
import { checkAgeGate } from "@/lib/services/age-gate";
import { ageOn, parseBirthDate, PLATFORM_MIN_AGE } from "@/lib/age";
import { normalizeUsername, usernameChecks } from "@/lib/validation/auth";
import { prisma } from "@/lib/prisma";
import { queueProofCheck } from "@/lib/services/proof-fingerprints";
import { parseReference } from "@/lib/proof-match";
import { isIdentityVerified } from "@/lib/identity";
import { makeTournamentSlug } from "@/lib/slug";
import { prepareRulesForCreate } from "@/lib/services/rules";
import { assertOrganizerCanCreateTournament } from "@/lib/services/plan-gates";
import { checkOrganizerTrust, TrustLimitError, markPrizesPaid } from "@/lib/services/organizer-trust";
import { getLockState } from "@/lib/services/change-requests";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import { getOrganizerPause } from "@/lib/services/organizer-reports";
import { checkPrizeBreakdown, type AwardInput } from "@/lib/prize-awards";
import { replacePrizeAwards, loadAwards } from "@/lib/services/prize-awards";
import { conditionsOf } from "@/lib/entry-conditions";
import { getPaidPlanCodes, holdsPaidPlan } from "@/lib/plans";
import { checkTierEntryGate, resolveTierSetting } from "@/lib/services/competitive-tiers";
import {
  checkInstitutionGate,
  getRegistrationActor,
  reserveInstitutionSlot,
} from "@/lib/services/institutions";
import { listActivePenalties } from "@/lib/services/penalties";
import {
  notifyNewQueueItem,
  notifyAwaitingPayment,
  notifyEntryDecision,
} from "@/lib/services/institution-notifications";
import { countriesInRegion, type RegionKey } from "@/lib/geo-data";
import { checkAgainstPool, replacePrizeTiers, type PrizeTierInput } from "@/lib/services/prize-tiers";
import { hybridStagesError } from "@/lib/services/stages";
import { venueIsComplete, checkInWindowError, generateCheckInCode } from "@/lib/services/venue";
import { tryToUsd } from "@/lib/currency-fx";
import { awardTournamentRatings } from "@/lib/services/ratings";
import type { RuleFields } from "@/lib/rules";
import type {
  Prisma,
  TournamentStatus,
  TournamentType,
  TournamentMode,
  EntryType,
  CompetitiveTier,
  AudienceScope,
  VenueType,
} from "@prisma/client";

export interface TournamentListFilters {
  game?: string;
  organizerId?: string;
  type?: TournamentType;
  mode?: TournamentMode;
  entryType?: EntryType;
  audienceScope?: AudienceScope;
  venueType?: VenueType;
  // Country (ISO) or broader region key. Worldwide tournaments (no country)
  // always match, since they're open to anyone anywhere.
  country?: string;
  region?: RegionKey;
  status?: TournamentStatus;
  search?: string;
  page?: number;
  // Hide tournaments of games that aren't shown in this country (see lib/game-region.ts).
  // undefined = no filtering (admins, internal callers); null = country unknown.
  viewerCountry?: string | null;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Shared by every place a registration is actually created (self, club,
// organizer manual-add) — see incrementTournamentClick for the matching
// click counter. Best-effort: a failed count bump shouldn't fail the
// registration itself.
export async function bumpRegistrationCount(tournamentId: string) {
  await prisma.tournament
    .update({ where: { id: tournamentId }, data: { registrationCount: { increment: 1 } } })
    .catch(() => null);
}

export async function listTournaments(filters: TournamentListFilters) {
  const page = Math.max(filters.page ?? 1, 1);
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const where: Prisma.TournamentWhereInput = {
    // Public browse only ever shows tournaments past the draft stage —
    // drafts are only visible to their owning organizer (see getMyTournaments).
    status: filters.status ?? { not: "draft" },
    ...(filters.type && { type: filters.type }),
    ...(filters.mode && { mode: filters.mode }),
    ...(filters.entryType && { entryType: filters.entryType }),
    ...(filters.audienceScope && { audienceScope: filters.audienceScope }),
    ...(filters.venueType && { venueType: filters.venueType }),
    ...((filters.country || filters.region) && {
      AND: [
        {
          OR: [
            { country: null },
            {
              country: filters.country
                ? filters.country
                : { in: countriesInRegion(filters.region as RegionKey) },
            },
          ],
        },
      ],
    }),
    ...(filters.organizerId && { organizerId: filters.organizerId }),
    ...(filters.game && { game: { name: { equals: filters.game, mode: "insensitive" } } }),
    ...(filters.search && {
      name: { contains: filters.search, mode: "insensitive" },
    }),
  };

  if (filters.viewerCountry !== undefined) {
    const existing = where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : [];
    where.AND = [...existing, { game: gameVisibilityWhere(filters.viewerCountry) }];
  }

  const [data, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      include: {
        game: true,
        organizer: { select: { id: true, orgName: true, socialLinks: true } },
      },
      orderBy: { startAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.tournament.count({ where }),
  ]);

  return { data, page, limit, total };
}

export async function getTournamentById(idOrSlug: string) {
  const tournament = await prisma.tournament.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      game: true,
      organizer: { include: { user: { select: { kycStatus: true, avatarUrl: true } }, identity: { select: { status: true, validUntil: true } } } },
      stages: { orderBy: { order: "asc" } },
      prizeTiers: { orderBy: { positionFrom: "asc" } },
      prizeAwards: { orderBy: { sortOrder: "asc" } },
      rules: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: { appliesToStage: { select: { id: true, name: true } } },
      },
      _count: { select: { registrations: { where: { status: { in: ["pending", "approved"] } } } } },
    },
  });
  if (!tournament) return null;

  // Verified badge is derived (spec §7): paid plan AND a verified identity
  // (organizer application approval alone is not enough).
  const paid = await getPaidPlanCodes();
  return {
    ...tournament,
    organizerVerified:
      holdsPaidPlan(tournament.organizer, paid) && isIdentityVerified(tournament.organizer.identity),
  };
}

export interface CreateTournamentInput {
  organizerId: string;
  gameId: string;
  name: string;
  description?: string;
  bannerUrl?: string;
  type: TournamentType;
  mode: TournamentMode;
  maxTeamSize?: number;
  maxTeams: number;
  playersPerRoom?: number;
  format: Prisma.TournamentCreateInput["format"];
  entryType: EntryType;
  entryFeeAmount?: number;
  entryFeeCurrency?: string;
  paymentInstructions?: string;
  prizePoolAmount?: number;
  prizePoolCurrency?: string;
  competitiveTier?: CompetitiveTier;
  audienceScope?: AudienceScope;
  requireFreshInstitutionProof?: boolean;
  minAge?: number; // 13 | 16 | 18
  requireParentalConsent?: boolean; // under-18 players need a guardian's consent
  venueType?: VenueType;
  country?: string | null;
  prizeTiers?: PrizeTierInput[];
  prizeAwards?: AwardInput[];
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  checkInOpensAt?: Date | null;
  checkInClosesAt?: Date | null;
  customFields?: unknown;
  // Already validated by parseRuleList (see lib/rules.ts). Plain-text rules
  // arrive here as custom warning rules.
  rules?: (RuleFields & { suggestedRuleId: string | null })[];
  startAt?: Date;
}

// Throws PlanLimitError (lib/services/plan-gates.ts) when the organizer's
// plan doesn't allow another tournament this month or in this game.
export async function createTournament(input: CreateTournamentInput) {
  const organizer = await prisma.organizerProfile.findUnique({ where: { id: input.organizerId } });
  if (!organizer) throw new Error("Organizer profile not found.");
  await assertOrganizerCanCreateTournament(organizer, input.gameId);

  // Anti-scam gate: starter limits for new organizers, and no new paid or
  // prized events while an earlier prize payout is unsettled.
  const trust = await checkOrganizerTrust({
    organizerId: input.organizerId,
    entryType: input.entryType,
    entryFee: input.entryFeeAmount && input.entryFeeCurrency ? { amount: Number(input.entryFeeAmount), currency: input.entryFeeCurrency } : null,
    prizePool: input.prizePoolAmount && input.prizePoolCurrency ? { amount: Number(input.prizePoolAmount), currency: input.prizePoolCurrency } : null,
    maxTeams: input.maxTeams,
  });
  if (!trust.ok) throw new TrustLimitError(trust.code, trust.message);

  return prisma.tournament.create({
    data: {
      slug: makeTournamentSlug(input.name),
      organizer: { connect: { id: input.organizerId } },
      game: { connect: { id: input.gameId } },
      name: input.name,
      description: input.description,
      bannerUrl: input.bannerUrl,
      type: input.type,
      mode: input.mode,
      maxTeamSize: input.maxTeamSize,
      maxTeams: input.maxTeams,
      playersPerRoom: input.playersPerRoom,
      format: input.format,
      entryType: input.entryType,
      entryFeeAmount: input.entryFeeAmount,
      entryFeeCurrency: input.entryFeeCurrency,
      paymentInstructions: input.paymentInstructions,
      prizePoolAmount: input.prizePoolAmount,
      prizePoolCurrency: input.prizePoolCurrency,
      competitiveTier: input.competitiveTier ?? "none",
      audienceScope: input.audienceScope ?? "open",
      minAge: input.minAge ?? 13,
      // 18+ events have no minors, so consent can only apply below 18.
      requireParentalConsent: !!input.requireParentalConsent && (input.minAge ?? 13) < 18,
      venueType: input.venueType ?? "online",
      country: input.country ?? null,
      // Venue details only mean something for LAN.
      ...(input.venueType === "lan"
        ? {
            venueName: input.venueName?.trim(),
            venueAddress: input.venueAddress?.trim(),
            venueCity: input.venueCity?.trim(),
            checkInOpensAt: input.checkInOpensAt,
            checkInClosesAt: input.checkInClosesAt,
            checkInCode: generateCheckInCode(),
          }
        : {}),
      // The extra proof only means something on institution-only tournaments.
      requireFreshInstitutionProof:
        input.audienceScope === "institution" && !!input.requireFreshInstitutionProof,
      customFields: input.customFields as Prisma.InputJsonValue,
      startAt: input.startAt,
      status: "draft",
      rules: input.rules?.length
        ? { create: await prepareRulesForCreate(input.rules) }
        : undefined,
      prizeTiers: input.prizeTiers?.length
        ? { create: input.prizeTiers.map((t) => ({ positionFrom: t.from, positionTo: t.to, amount: t.amount })) }
        : undefined,
      prizeAwards: input.prizeAwards?.length
        ? { create: input.prizeAwards.map((a, i) => ({ name: a.name, cashAmount: a.cashAmount, prizeText: a.prizeText, sortOrder: i })) }
        : undefined,
    },
    include: { rules: { orderBy: [{ position: "asc" }, { id: "asc" }] } },
  });
}

// Publishing is gated on organizer approval — enforced here so it can't be
// bypassed by hitting the route handler directly with a crafted request.
export async function publishTournament(tournamentId: string, organizerId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { organizer: true },
  });

  if (!tournament) return { error: "not_found" as const };
  if (tournament.organizerId !== organizerId) return { error: "forbidden" as const };
  if (tournament.status !== "draft") return { error: "invalid_status" as const };

  // Enforced here, not just at the route level — publishTournament is the
  // actual boundary that matters if anything else ever calls it directly.
  const organizerUser = await prisma.user.findUnique({
    where: { id: tournament.organizer.userId },
  });
  if (organizerUser?.kycStatus !== "approved") {
    return { error: "organizer_not_approved" as const };
  }

  // A prize pool must be fully described before players can see it: how many
  // teams win and how much each gets, plus any awards. (Also catches older
  // drafts that only had a total.)
  if (tournament.prizePoolAmount && Number(tournament.prizePoolAmount) > 0 && (await getFeatureFlags()).prizeBreakdown) {
    const [tierRows, awards] = await Promise.all([
      prisma.prizeTier.findMany({ where: { tournamentId } }),
      loadAwards(tournamentId),
    ]);
    const breakdown = checkPrizeBreakdown({
      pool: Number(tournament.prizePoolAmount),
      tiers: tierRows.map((r) => ({ from: r.positionFrom, to: r.positionTo, amount: Number(r.amount) })),
      awards,
    });
    if (breakdown) return { error: "prize_split_incomplete" as const, message: breakdown };
  }

  // Re-checked at publish: a draft made while eligible can't go live while an
  // earlier payout is unsettled, and limits may have changed since creation.
  {
    const trust = await checkOrganizerTrust({
      organizerId,
      entryType: tournament.entryType,
      entryFee: tournament.entryFeeAmount && tournament.entryFeeCurrency ? { amount: Number(tournament.entryFeeAmount), currency: tournament.entryFeeCurrency } : null,
      prizePool: tournament.prizePoolAmount && tournament.prizePoolCurrency ? { amount: Number(tournament.prizePoolAmount), currency: tournament.prizePoolCurrency } : null,
      maxTeams: tournament.maxTeams,
    });
    if (!trust.ok) return { error: trust.code, message: trust.message };
  }

  // A hybrid tournament needs its online AND LAN stages set up.
  if (tournament.venueType === "hybrid") {
    const stages = await prisma.stage.findMany({ where: { tournamentId } });
    const hybridError = hybridStagesError(stages);
    if (hybridError) return { error: "venue_incomplete" as const, message: hybridError };
  }

  // An institution-only tournament is hosted BY an institute: it must be
  // registered and admin-verified, or no player could ever qualify to enter.
  if (tournament.audienceScope === "institution") {
    const host = await prisma.institution.findUnique({
      where: { organizerId },
      select: { verified: true },
    });
    if (!host?.verified) {
      return {
        error: "institution_host_required" as const,
        message: "Institution-only tournaments need a verified institute. Register yours under My institute.",
      };
    }
  }

  // A LAN tournament needs a venue before it goes public.
  if (!venueIsComplete(tournament)) {
    return {
      error: "venue_incomplete" as const,
      message: "Add the venue name, address and city before publishing a LAN tournament.",
    };
  }

  // Competitive-tier prize-pool floor (spec §9) — checked in USD-equivalent
  // regardless of which currency the organizer entered, via live FX
  // conversion (see lib/currency-fx.ts). "none" isn't a competitive tier —
  // no floor, no review gate.
  if (tournament.competitiveTier !== "none") {
    const setting = await resolveTierSetting(
      tournament.competitiveTier,
      tournament.organizer.country,
      tournament.organizer.region
    );
    if (setting) {
      if (!tournament.prizePoolAmount || !tournament.prizePoolCurrency) {
        return { error: "tier_floor_not_met" as const, message: "This tier requires a prize pool." };
      }
      const fxResult = await tryToUsd(Number(tournament.prizePoolAmount), tournament.prizePoolCurrency);
      if ("error" in fxResult) {
        return {
          error: "fx_unavailable" as const,
          message: "Couldn't verify the prize pool against this tier's floor right now — try again shortly.",
        };
      }
      const usd = fxResult.usd;
      if (usd < Number(setting.minPrizePoolUsd)) {
        return {
          error: "tier_floor_not_met" as const,
          message: `${tournament.competitiveTier}-tier requires a prize pool of at least $${setting.minPrizePoolUsd} USD-equivalent (this one converts to ~$${usd.toFixed(2)}).`,
        };
      }

      // Floor met. D/C/B/A are "instant" (B/A's rating gate is enforced at
      // registration time, not here — see checkTierEntryGate). S/National
      // go to admin review instead of publishing outright.
      if (setting.publishPath !== "instant") {
        const updated = await prisma.tournament.update({
          where: { id: tournamentId },
          data: { submittedForReview: true },
        });
        return { data: updated, pendingReview: true as const };
      }
    }
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "published" },
  });

  return { data: updated };
}

// ------------------------------------------------------------
// REGISTRATION
// ------------------------------------------------------------

// A registration holds its slot while pending or approved; rejected/
// disqualified ones don't (see registerForTournament). Used both for the
// capacity check and to show organizers how many slots are actually open.
async function getActiveRegistrationCount(tournamentId: string) {
  return prisma.registration.count({
    where: { tournamentId, status: { in: ["pending", "approved"] } },
  });
}

// For the organizer dashboard / tournament detail: how many of the
// tournament's slots are filled (holding pending or approved registrations)
// vs open (never taken, or freed by a rejection/disqualification).
export async function getTournamentCapacity(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { maxTeams: true },
  });
  if (!tournament) return null;

  const filled = await getActiveRegistrationCount(tournamentId);
  return { maxTeams: tournament.maxTeams, filled, open: Math.max(tournament.maxTeams - filled, 0) };
}

export interface RegisterInput {
  tournamentId: string;
  playerId: string;
  customFieldResponses?: unknown;
  paymentProofUrl?: string;
  /** The transaction ID the payer typed (required for paid entries). */
  paymentReference?: string;
  teamName?: string;
  teamMemberPlayerIds?: string[]; // for duo/squad modes
  // Set only when this registration is a club's persistent team entering
  // (submitClubTeamEntry) — the tier entry gate checks THIS team's rating
  // rather than whichever member happens to be listed first, since the
  // club team (not any one member) is what carries a rating across
  // tournaments (see ClubTeam.rating).
  clubTeamId?: string;
  // Private-bucket path of the per-tournament ID photo (institution-only
  // tournaments that ask for fresh proof).
  // Club entries skip the per-tournament ID photo (members are verified).
  skipInstitutionProof?: boolean;
}

export async function registerForTournament(input: RegisterInput) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
  });

  if (!tournament) return { error: "not_found" as const };

  if (!["published", "registration_open"].includes(tournament.status)) {
    return { error: "registration_closed" as const };
  }

  // Only pending/approved registrations hold a slot. A rejected or
  // disqualified registration frees its slot back up for anyone else to
  // self-serve into — this is what "sell a slot" (spec §2) relies on: the
  // organizer doesn't have to do anything for a freed slot to reopen, it
  // just stops counting against capacity. (Before this fix, rejected/DQ'd
  // registrations were kept for the audit trail but still counted forever,
  // so a freed slot could only ever be filled via manual-add.)
  const activeCount = await getActiveRegistrationCount(input.tournamentId);
  if (activeCount >= tournament.maxTeams) {
    return { error: "full" as const };
  }

  // Prevent anyone in this registration — the registering player OR any
  // named teammate — from already being registered for this tournament,
  // either solo or as a member of another team (the original check only
  // looked at Registration.playerId for the single registering player,
  // which is null for team registrations and ignored teammates entirely,
  // so the same person could end up on two teams in one tournament).
  // Same "only an active registration counts" rule as the capacity check
  // above — a rejected/disqualified registration frees the person to be
  // re-registered (by themselves or someone else), not just their slot.
  const allPlayerIds = [input.playerId, ...(input.teamMemberPlayerIds ?? [])];
  const existing = await prisma.registration.findFirst({
    where: {
      tournamentId: input.tournamentId,
      status: { in: ["pending", "approved"] },
      OR: [
        { playerId: { in: allPlayerIds } },
        { teamEntry: { members: { some: { playerId: { in: allPlayerIds } } } } },
      ],
    },
  });
  if (existing) return { error: "already_registered" as const };

  // Age gate: every player on this entry needs a date of birth on file and must
  // meet the tournament's minimum age (13 / 16 / 18).
  const ageGate = await checkAgeGate(input.tournamentId, allPlayerIds, { selfPlayerId: input.playerId });
  if ("error" in ageGate) return { error: ageGate.error, message: ageGate.message };

  // Competitive-tier entry gate (spec §9) — a B/A/S/National tournament
  // requires the registering player (or, for a club team, the team itself)
  // to already meet that tier's rating/win-count floor. D/C and non-
  // competitive tournaments have no gate. See checkTierEntryGate for the
  // resolution order (country > region > world settings).
  const gate = await checkTierEntryGate(
    input.tournamentId,
    input.clubTeamId ? { clubTeamId: input.clubTeamId } : { playerId: input.playerId }
  );
  if ("error" in gate && gate.error === "tier_gate") {
    return { error: "tier_gate" as const, message: gate.message };
  }

  // Institution-only gate (spec §8): every player on this entry must hold an
  // approved institution verification, and the registering player may need
  // to attach fresh proof. Applies to club entries too, since they register
  // through this function.
  const institutionGate = await checkInstitutionGate(input.tournamentId, allPlayerIds, {
    skipProof: input.skipInstitutionProof,
    selfPlayerId: input.playerId,
  });
  if ("error" in institutionGate) {
    return { error: institutionGate.error, message: institutionGate.message };
  }

  const paymentStatus =
    tournament.entryType === "free"
      ? ("waived" as const)
      : input.paymentProofUrl
        ? ("unpaid" as const) // stays unpaid until organizer verifies the screenshot
        : null;

  // An organizer paused after player reports takes no NEW paid registrations
  // until an admin reviews (existing registrations are untouched).
  if (tournament.entryType === "paid" && (await getOrganizerPause(tournament.organizerId)).paused) {
    return { error: "organizer_paused" as const };
  }
  if (tournament.entryType === "paid" && !input.paymentProofUrl) {
    return { error: "payment_proof_required" as const };
  }
  const reference = parseReference(input.paymentReference);
  if (tournament.entryType === "paid" && !reference) {
    return { error: "payment_reference_required" as const };
  }

  // Entry conditions (follow / share…) must each be ticked. The organizer
  // verifies them when approving.
  {
    const answers = (input.customFieldResponses ?? {}) as Record<string, unknown>;
    const unmet = conditionsOf(tournament.customFields).filter((c) => answers[c.key] !== "yes");
    if (unmet.length > 0) return { error: "conditions_not_met" as const, message: `Confirm every entry condition first: ${unmet.map((c) => c.label).join(", ")}.` };
  }

  // Squad/duo mode: create a TeamEntry + members. Solo: register the player directly.
  if (tournament.mode !== "solo" && input.teamMemberPlayerIds?.length) {
    // One transaction: the entry limit is re-checked under a per-institute lock
    // (see reserveInstitutionSlot) and the team + registration are saved together.
    const created = await prisma.$transaction(async (tx) => {
      const full = await reserveInstitutionSlot(tx, input.tournamentId, institutionGate.institutionId);
      if (full) return full;
      const teamEntry = await tx.teamEntry.create({
        data: {
          tournamentId: input.tournamentId,
          name: input.teamName ?? "Unnamed team",
          members: {
            create: [input.playerId, ...input.teamMemberPlayerIds!].map((playerId) => ({
              playerId,
            })),
          },
        },
      });
      return tx.registration.create({
        data: {
          tournamentId: input.tournamentId,
          teamEntryId: teamEntry.id,
          paymentStatus: paymentStatus ?? "unpaid",
          paymentProofUrl: input.paymentProofUrl,
          paymentReference: reference?.display ?? null,
          institutionProofPath: institutionGate.proofPath,
          routedInstitutionId: institutionGate.routedInstitutionId,
          institutionId: institutionGate.institutionId,
          customFieldResponses: input.customFieldResponses as Prisma.InputJsonValue,
        },
      });
    });
    if ("error" in created) return { error: created.error, message: created.message };
    const registration = created;
    await bumpRegistrationCount(input.tournamentId);
    await queueProofCheck({ kind: "registration", refId: registration.id, playerId: input.playerId, organizerId: tournament.organizerId }, input.paymentProofUrl, reference?.key);
    if (institutionGate.routedInstitutionId) {
      await notifyNewQueueItem("tournament", input.tournamentId, institutionGate.routedInstitutionId);
    }
    return { data: registration };
  }
  const created = await prisma.$transaction(async (tx) => {
    const full = await reserveInstitutionSlot(tx, input.tournamentId, institutionGate.institutionId);
    if (full) return full;
    return tx.registration.create({
      data: {
        tournamentId: input.tournamentId,
        playerId: input.playerId,
        paymentStatus: paymentStatus ?? "unpaid",
        paymentProofUrl: input.paymentProofUrl,
        paymentReference: reference?.display ?? null,
        institutionProofPath: institutionGate.proofPath,
        routedInstitutionId: institutionGate.routedInstitutionId,
        institutionId: institutionGate.institutionId,
        customFieldResponses: input.customFieldResponses as Prisma.InputJsonValue,
      },
    });
  });
  if ("error" in created) return { error: created.error, message: created.message };
  const registration = created;
  await bumpRegistrationCount(input.tournamentId);
  await queueProofCheck({ kind: "registration", refId: registration.id, playerId: input.playerId, organizerId: tournament.organizerId }, input.paymentProofUrl, reference?.key);

  if (institutionGate.routedInstitutionId) {
    await notifyNewQueueItem("tournament", input.tournamentId, institutionGate.routedInstitutionId);
  }
  return { data: registration };
}

// Queue of registrations. The host sees everything (view "all") or just the
// ones it handles itself (view "mine": its own members, guests and open
// entries — i.e. not routed to a co-host). A co-host only ever sees the
// registrations routed to its own institute.
export async function listRegistrations(
  tournamentId: string,
  organizerId: string,
  status?: string,
  view: "all" | "mine" = "all"
) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };

  let scope: Record<string, unknown> = {};
  let role: "host" | "cohost" = "host";
  if (tournament.organizerId === organizerId) {
    if (view === "mine") scope = { routedInstitutionId: null };
  } else {
    const link = await prisma.tournamentInstitution.findFirst({
      where: {
        tournamentId,
        role: "cohost",
        status: "accepted",
        institution: { organizerId, verified: true },
      },
      select: { institutionId: true },
    });
    if (!link) return { error: "forbidden" as const };
    role = "cohost";
    scope = { routedInstitutionId: link.institutionId };
  }

  const registrations = await prisma.registration.findMany({
    where: {
      tournamentId,
      ...scope,
      ...(status ? { status: status as never } : {}),
    },
    include: {
      player: { include: { user: { select: { displayName: true } } } },
      teamEntry: { include: { members: true } },
      routedInstitution: { select: { id: true, name: true } },
    },
    orderBy: { registeredAt: "asc" },
  });
  const penalties = await listActivePenalties(registrations.map((r) => r.id));

  return {
    data: registrations.map((r) => ({ ...r, penalties: penalties.get(r.id) ?? [] })),
    role,
  };
}

// Host: may act on any registration. Co-host: only on registrations routed to
// its own (accepted) institute. A co-host approving a PAID entry confirms
// eligibility only — the host still verifies the payment before the entry
// becomes approved, so a co-host can't mark money as received.
export async function approveRegistration(registrationId: string, organizerId: string) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: true },
  });
  if (!registration) return { error: "not_found" as const };
  const actor = await getRegistrationActor(
    registration.tournamentId,
    registration.tournament.organizerId,
    organizerId,
    registration.routedInstitutionId
  );
  if (!actor) return { error: "forbidden" as const };

  if (actor.role === "cohost") {
    const needsPayment =
      registration.tournament.entryType === "paid" && registration.paymentStatus === "unpaid";
    const updated = await prisma.registration.update({
      where: { id: registrationId },
      data: needsPayment
        ? { institutionApprovedAt: new Date(), approvedByInstitutionId: actor.institutionId }
        : {
            status: "approved",
            approvedAt: new Date(),
            institutionApprovedAt: new Date(),
            approvedByInstitutionId: actor.institutionId,
          },
    });
    await notifyEntryDecision(registrationId, true, true, needsPayment);
    if (needsPayment) await notifyAwaitingPayment(registration.tournamentId, actor.institutionId);
    return { data: updated, awaitingHostPayment: needsPayment };
  }

  const hostInstitute = await prisma.institution.findUnique({
    where: { organizerId },
    select: { id: true },
  });
  const updated = await prisma.registration.update({
    where: { id: registrationId },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedByInstitutionId: hostInstitute?.id ?? null,
      // Paid entries get marked paid on approval, since approval implies the
      // organizer verified the payment screenshot. Free/waived entries stay as-is.
      paymentStatus:
        registration.paymentStatus === "unpaid" ? "paid" : registration.paymentStatus,
    },
  });

  await notifyEntryDecision(registrationId, true, false, false);
  return { data: updated, awaitingHostPayment: false };
}

export async function rejectRegistration(
  registrationId: string,
  organizerId: string,
  reason?: string
) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: true },
  });
  if (!registration) return { error: "not_found" as const };
  const actor = await getRegistrationActor(
    registration.tournamentId,
    registration.tournament.organizerId,
    organizerId,
    registration.routedInstitutionId
  );
  if (!actor) return { error: "forbidden" as const };

  const updated = await prisma.registration.update({
    where: { id: registrationId },
    data: { status: "rejected" },
  });

  await notifyEntryDecision(registrationId, false, actor.role === "cohost", false);
  return { data: updated, reason };
}

// ------------------------------------------------------------
// ROOM REVEAL — time-gated at the service layer, not just the UI
// ------------------------------------------------------------

export async function getRoomForPlayer(stageId: string, playerId: string) {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    include: { tournament: true },
  });
  if (!stage) return { error: "not_found" as const };

  // Confirm this player has an approved registration for this tournament
  const registration = await prisma.registration.findFirst({
    where: {
      tournamentId: stage.tournamentId,
      status: "approved",
      OR: [
        { playerId },
        { teamEntry: { members: { some: { playerId } } } },
      ],
    },
  });
  if (!registration) return { error: "not_registered" as const };

  // Under-18 players need a guardian's consent first when the tournament asks for it.
  const consent = await checkConsentGate(stage.tournamentId, playerId);
  if ("error" in consent) return { error: consent.error, message: consent.message };

  // LAN tournaments (and LAN stages of a hybrid one) have no room
  // credentials — players check in on site.
  if (stage.tournament.venueType === "lan") return { error: "lan_no_room" as const };
  if (stage.tournament.venueType === "hybrid" && stage.venueType === "lan") {
    return { error: "lan_no_room" as const };
  }

  // Restricted stages (e.g. semis/finals) are only for advanced entries.
  if (stage.restricted) {
    const advanced = await prisma.stageEntry.findFirst({
      where: { stageId: stage.id, registrationId: registration.id },
      select: { id: true },
    });
    if (!advanced) return { error: "not_advanced" as const };
  }

  if (!stage.roomId || !stage.roomRevealAt) {
    return { error: "room_not_set" as const };
  }

  if (new Date() < stage.roomRevealAt) {
    return { error: "not_yet_revealed" as const, revealAt: stage.roomRevealAt };
  }

  return { data: { roomId: stage.roomId, roomPassword: stage.roomPassword } };
}

export async function getMyRegistrations(playerId: string) {
  return prisma.registration.findMany({
    where: {
      OR: [
        { playerId },
        { teamEntry: { members: { some: { playerId } } } },
      ],
    },
    include: {
      tournament: { include: { game: true } },
    },
    orderBy: { registeredAt: "desc" },
  });
}

export async function getMyTournaments(organizerId: string) {
  return prisma.tournament.findMany({
    where: { organizerId },
    include: {
      game: true,
      _count: { select: { registrations: { where: { status: { in: ["pending", "approved"] } } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ------------------------------------------------------------
// ADMIN
// ------------------------------------------------------------

export async function listPendingOrganizers() {
  return prisma.organizerProfile.findMany({
    where: { user: { kycStatus: { in: ["none", "pending"] } } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function approveOrganizer(organizerProfileId: string, adminId: string) {
  const organizer = await prisma.organizerProfile.findUnique({
    where: { id: organizerProfileId },
  });
  if (!organizer) return { error: "not_found" as const };

  const updated = await prisma.user.update({
    where: { id: organizer.userId },
    data: { kycStatus: "approved" },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "approved_organizer",
      targetType: "OrganizerProfile",
      targetId: organizerProfileId,
    },
  });

  return { data: updated };
}

export async function rejectOrganizer(
  organizerProfileId: string,
  adminId: string,
  reason?: string
) {
  const organizer = await prisma.organizerProfile.findUnique({
    where: { id: organizerProfileId },
  });
  if (!organizer) return { error: "not_found" as const };

  const updated = await prisma.user.update({
    where: { id: organizer.userId },
    data: { kycStatus: "rejected" },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "rejected_organizer",
      targetType: "OrganizerProfile",
      targetId: organizerProfileId,
      notes: reason,
    },
  });

  return { data: updated };
}

export async function listPendingGameRequests() {
  return prisma.gameRequest.findMany({
    where: { status: "pending" },
    include: { organizer: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function approveGameRequest(gameRequestId: string, adminId: string) {
  const request = await prisma.gameRequest.findUnique({ where: { id: gameRequestId } });
  if (!request) return { error: "not_found" as const };
  if (request.status !== "pending") return { error: "already_reviewed" as const };

  const game = await prisma.game.create({
    data: { name: request.gameName },
  });

  const updated = await prisma.gameRequest.update({
    where: { id: gameRequestId },
    data: { status: "approved", approvedGameId: game.id },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "approved_game_request",
      targetType: "GameRequest",
      targetId: gameRequestId,
    },
  });

  return { data: updated };
}

export async function rejectGameRequest(gameRequestId: string, adminId: string, reason?: string) {
  const request = await prisma.gameRequest.findUnique({ where: { id: gameRequestId } });
  if (!request) return { error: "not_found" as const };
  if (request.status !== "pending") return { error: "already_reviewed" as const };

  const updated = await prisma.gameRequest.update({
    where: { id: gameRequestId },
    data: { status: "rejected" },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "rejected_game_request",
      targetType: "GameRequest",
      targetId: gameRequestId,
      notes: reason,
    },
  });

  return { data: updated };
}

// ------------------------------------------------------------
// TOURNAMENT EDIT / CANCEL
// ------------------------------------------------------------

export interface UpdateTournamentInput {
  name?: string;
  description?: string;
  bannerUrl?: string;
  maxTeams?: number;
  playersPerRoom?: number;
  entryFeeAmount?: number;
  entryFeeCurrency?: string;
  paymentInstructions?: string;
  prizePoolAmount?: number;
  prizePoolCurrency?: string;
  competitiveTier?: CompetitiveTier;
  audienceScope?: AudienceScope;
  requireFreshInstitutionProof?: boolean;
  minAge?: number; // 13 | 16 | 18
  requireParentalConsent?: boolean; // under-18 players need a guardian's consent
  venueType?: VenueType;
  country?: string | null;
  prizeTiers?: PrizeTierInput[];
  prizeAwards?: AwardInput[];
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  checkInOpensAt?: Date | null;
  checkInClosesAt?: Date | null;
  startAt?: Date;
}

export async function updateTournament(
  tournamentId: string,
  organizerId: string,
  input: UpdateTournamentInput
) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };
  if (tournament.organizerId !== organizerId) return { error: "forbidden" as const };

  // The prize split lives in its own table, so it is split off here and never
  // reaches the tournament update below.
  const { prizeTiers, prizeAwards, ...rest } = input;
  const data: Omit<UpdateTournamentInput, "prizeTiers" | "prizeAwards"> = { ...rest };

  // The prize pool, how it is split by place, and the extra awards are ONE
  // promise to everyone who registered. With the tournament lock on, any change
  // once players are in goes through an admin (change request), not a direct
  // edit. (The place split was always locked once players registered; the pool
  // and awards follow the lock switch.) Before that, the result must account
  // for the whole pool when "prize breakdown required" is on.
  {
    const [existing, existingAwards, flags, lock] = await Promise.all([
      prisma.prizeTier.findMany({ where: { tournamentId }, orderBy: { positionFrom: "asc" } }),
      loadAwards(tournamentId),
      getFeatureFlags(),
      getLockState(tournamentId),
    ]);
    const existingTiers: PrizeTierInput[] = existing.map((r) => ({ from: r.positionFrom, to: r.positionTo, amount: Number(r.amount) }));
    const poolBefore = tournament.prizePoolAmount ? Number(tournament.prizePoolAmount) : 0;
    const poolAfter = data.prizePoolAmount !== undefined ? Number(data.prizePoolAmount) : poolBefore;
    const tiersAfter = prizeTiers ?? existingTiers;
    const awardsAfter = prizeAwards ?? existingAwards;

    const poolError = checkAgainstPool(tiersAfter, poolAfter);
    if (poolError) return { error: "invalid_prize_tiers" as const, message: poolError };

    const poolChanged = poolAfter !== poolBefore;
    const tiersChanged = prizeTiers !== undefined && JSON.stringify(prizeTiers) !== JSON.stringify(existingTiers);
    const awardsChanged = prizeAwards !== undefined && JSON.stringify(prizeAwards) !== JSON.stringify(existingAwards);

    if (tiersChanged && (await getActiveRegistrationCount(tournamentId)) > 0) return { error: "prize_locked" as const };
    if (lock?.locked) {
      if (poolChanged) return { error: "pool_locked" as const };
      if (awardsChanged) return { error: "prize_locked" as const };
    }

    // New awards can't be added while the feature is off (existing ones can be kept or removed).
    if (awardsChanged && !flags.specialAwards) {
      const known = new Set(existingAwards.map((a) => a.name.toLowerCase()));
      if (awardsAfter.some((a) => !known.has(a.name.toLowerCase()))) {
        return { error: "invalid_prize_tiers" as const, message: "Special awards are switched off on this site." };
      }
    }

    if ((poolChanged || tiersChanged || awardsChanged) && flags.prizeBreakdown) {
      const breakdown = checkPrizeBreakdown({ pool: poolAfter, tiers: tiersAfter, awards: awardsAfter });
      if (breakdown) return { error: "invalid_prize_tiers" as const, message: breakdown };
    }
  }

  // A free tournament carries no entry fee; the edit form always sends one
  // (0), which used to get written onto free tournaments.
  if (tournament.entryType === "free") {
    delete data.entryFeeAmount;
    delete data.entryFeeCurrency;
  } else if (data.entryFeeAmount !== undefined && Number(data.entryFeeAmount) <= 0) {
    return { error: "invalid_fee" as const };
  }

  // Money that players have already committed to can't move under them.
  // Only an actual CHANGE is blocked — the edit form resends the current
  // values on every save, and that must keep working.
  const feeChanged =
    tournament.entryType === "paid" &&
    ((data.entryFeeAmount !== undefined &&
      Number(tournament.entryFeeAmount) !== Number(data.entryFeeAmount)) ||
      (data.entryFeeCurrency !== undefined &&
        tournament.entryFeeCurrency !== data.entryFeeCurrency));
  const prizeCurrencyChanged =
    data.prizePoolCurrency !== undefined &&
    tournament.prizePoolCurrency !== null &&
    tournament.prizePoolCurrency !== data.prizePoolCurrency;

  if (feeChanged || prizeCurrencyChanged) {
    // Same definition of "holds a slot" as the capacity check: rejected and
    // disqualified registrations don't count.
    if ((await getActiveRegistrationCount(tournamentId)) > 0) {
      return { error: feeChanged ? ("fee_locked" as const) : ("currency_locked" as const) };
    }
  }

  // Who may enter is a promise made to everyone who already registered:
  // narrowing to students could strand them, and dropping the extra-proof
  // requirement would be unfair to those who already supplied it. Only a
  // real CHANGE is blocked (the edit form resends current values), and only
  // while active registrations exist.
  const effectiveScope = data.audienceScope ?? tournament.audienceScope;
  if (effectiveScope !== "institution") data.requireFreshInstitutionProof = false;
  const scopeChanged =
    (data.audienceScope !== undefined && data.audienceScope !== tournament.audienceScope) ||
    (data.requireFreshInstitutionProof !== undefined &&
      data.requireFreshInstitutionProof !== tournament.requireFreshInstitutionProof);
  if (scopeChanged && (await getActiveRegistrationCount(tournamentId)) > 0) {
    return { error: "audience_locked" as const };
  }

  // Same promise for the age limit: raising it could strand registered
  // players and lowering it changes who they agreed to play against.
  // 18+ events have no minors, so consent can only apply below 18.
  if ((data.minAge ?? tournament.minAge) >= 18) data.requireParentalConsent = false;
  const ageChanged =
    (data.minAge !== undefined && data.minAge !== tournament.minAge) ||
    (data.requireParentalConsent !== undefined && data.requireParentalConsent !== tournament.requireParentalConsent);
  if (ageChanged && (await getActiveRegistrationCount(tournamentId)) > 0) {
    return { error: "age_locked" as const };
  }

  // Online <-> LAN changes what players are promised (room credentials vs.
  // showing up somewhere), so it locks once anyone has registered. The venue
  // DETAILS can still be corrected afterwards (a typo in the address).
  const venueTypeChanged = data.venueType !== undefined && data.venueType !== tournament.venueType;
  if (venueTypeChanged && (await getActiveRegistrationCount(tournamentId)) > 0) {
    return { error: "venue_locked" as const };
  }
  const effectiveVenue = data.venueType ?? tournament.venueType;
  // Leaving hybrid: stages go back to plain online stages (they follow the
  // tournament's venue again), and any advancement restriction is dropped.
  if (venueTypeChanged && tournament.venueType === "hybrid") {
    await prisma.stage.updateMany({
      where: { tournamentId },
      data: {
        venueType: "online", venueName: null, venueAddress: null, venueCity: null,
        checkInOpensAt: null, checkInClosesAt: null, checkInCode: null, restricted: false,
      },
    });
    await prisma.stageEntry.deleteMany({ where: { stage: { tournamentId } } });
  }
  if (effectiveVenue === "lan") {
    const windowError = checkInWindowError(
      data.checkInOpensAt !== undefined ? data.checkInOpensAt : tournament.checkInOpensAt,
      data.checkInClosesAt !== undefined ? data.checkInClosesAt : tournament.checkInClosesAt
    );
    if (windowError) return { error: "invalid_check_in_window" as const, message: windowError };
    // Switching to LAN needs a check-in code; switching away clears the venue.
    if (!tournament.checkInCode) {
      (data as Prisma.TournamentUpdateInput).checkInCode = generateCheckInCode();
    }
  } else {
    // Going (or staying) online: wipe any venue details and the check-in code.
    const clear = data as Prisma.TournamentUpdateInput;
    clear.venueName = null;
    clear.venueAddress = null;
    clear.venueCity = null;
    clear.checkInOpensAt = null;
    clear.checkInClosesAt = null;
    clear.checkInCode = null;
  }

  // A competitive tier is what the prize-pool floor and the registration
  // rating gate were checked against — letting it change once the
  // tournament is live would let an organizer bait-and-switch (publish as
  // D, quietly bump to S once real money's on the table) or strand already-
  // registered players who met a lower tier's gate. Only draft tournaments
  // can have their tier changed.
  const tierChanged =
    data.competitiveTier !== undefined && data.competitiveTier !== tournament.competitiveTier;
  if (tierChanged && tournament.status !== "draft") {
    return { error: "tier_locked" as const };
  }

  // Editing the tier or the prize pool while an S/National submission is
  // still pending invalidates that submission — the admin would otherwise
  // be reviewing stale numbers. Re-publishing re-submits with the new ones.
  if (
    tournament.submittedForReview &&
    (tierChanged || data.prizePoolAmount !== undefined || data.prizePoolCurrency !== undefined)
  ) {
    (data as Prisma.TournamentUpdateInput).submittedForReview = false;
  }

  // Raising the fee, prize pool or capacity after creation must not dodge the
  // new-organizer limits. Only an actual increase is checked (the edit form
  // resends current values on every save).
  {
    const feeNow = Number(tournament.entryFeeAmount ?? 0);
    const prizeNow = Number(tournament.prizePoolAmount ?? 0);
    const feeAfter = data.entryFeeAmount !== undefined ? Number(data.entryFeeAmount) : feeNow;
    const prizeAfter = data.prizePoolAmount !== undefined ? Number(data.prizePoolAmount) : prizeNow;
    const capAfter = data.maxTeams ?? tournament.maxTeams;
    const currencyChanged =
      (data.entryFeeCurrency !== undefined && data.entryFeeCurrency !== tournament.entryFeeCurrency) ||
      (data.prizePoolCurrency !== undefined && data.prizePoolCurrency !== tournament.prizePoolCurrency);
    if (feeAfter > feeNow || prizeAfter > prizeNow || capAfter > tournament.maxTeams || currencyChanged) {
      const feeCurrency = data.entryFeeCurrency ?? tournament.entryFeeCurrency;
      const prizeCurrency = data.prizePoolCurrency ?? tournament.prizePoolCurrency;
      const trust = await checkOrganizerTrust({
        organizerId,
        entryType: tournament.entryType,
        entryFee: feeAfter > 0 && feeCurrency ? { amount: feeAfter, currency: feeCurrency } : null,
        prizePool: prizeAfter > 0 && prizeCurrency ? { amount: prizeAfter, currency: prizeCurrency } : null,
        maxTeams: capAfter,
      });
      if (!trust.ok) return { error: trust.code, message: trust.message };
    }
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data,
  });
  const ops = [
    ...(prizeTiers !== undefined ? replacePrizeTiers(tournamentId, prizeTiers) : []),
    ...(prizeAwards !== undefined ? replacePrizeAwards(tournamentId, prizeAwards) : []),
  ];
  if (ops.length > 0) await prisma.$transaction(ops);
  return { data: updated };
}

export async function cancelTournament(tournamentId: string, organizerId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };
  if (tournament.organizerId !== organizerId) return { error: "forbidden" as const };
  if (tournament.status === "cancelled" || tournament.status === "completed") {
    return { error: "invalid_status" as const };
  }

  // Paid or prized events with registered players can't be cancelled by the
  // organizer alone — they ask an admin (see change-requests.ts).
  const lock = await getLockState(tournamentId);
  if (lock?.locked) return { error: "locked" as const };

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "cancelled" },
  });

  // Phase 1 has no automated refund engine (that's Phase 7) — cancelling
  // just changes status. Paid registrations still show paymentStatus:
  // "paid" so the organizer can see who needs a manual refund by looking
  // at this tournament's registration list.

  return { data: updated };
}

// ------------------------------------------------------------
// PLAYER PROFILE
// ------------------------------------------------------------

export async function getPlayerProfileByUserId(userId: string) {
  return prisma.playerProfile.findUnique({
    where: { userId },
    include: { user: { select: { displayName: true, avatarUrl: true, email: true } } },
  });
}

export async function getPublicPlayerProfile(playerId: string) {
  const player = await prisma.playerProfile.findUnique({
    where: { id: playerId },
    include: {
      user: { select: { displayName: true, avatarUrl: true } },
      _count: { select: { registrations: true } },
    },
  });
  if (!player) return null;
  // Player verified = paid plan (no KYC needed), spec §7.
  return { ...player, verified: holdsPaidPlan(player, await getPaidPlanCodes()) };
}

export interface UpdatePlayerProfileInput {
  firstName: string; // required
  lastName: string; // required
  avatarUrl?: string;
  // Only used while the player has no username yet; once chosen it can't be changed here.
  username?: string;
  mobileNumber?: string;
  region?: string;
  country?: string;
  city?: string;
  // YYYY-MM-DD. Only used the first time; once saved it can't be changed here.
  birthDate?: string;
  gender?: string;
  hobbies?: string;
  favoriteGames?: string[];
  playStyle?: "casual" | "competitive";
}

export async function updatePlayerProfile(userId: string, input: UpdatePlayerProfileInput) {
  if (!input.firstName?.trim() || !input.lastName?.trim()) {
    return { error: "validation_error" as const, message: "First and last name are required." };
  }

  // Date of birth: asked for until it is saved, then locked so it can't be
  // changed to get into an older tournament. (Support can correct a mistake.)
  const current = await prisma.playerProfile.findUnique({ where: { userId }, select: { birthDate: true, username: true } });

  // Username: required until chosen (social sign-ins have none), then fixed. Rankings and
  // public tables show it, so it can't keep changing.
  let username: string | undefined;
  if (!current?.username) {
    const wanted = normalizeUsername(input.username ?? "");
    if (!wanted) return { error: "username_required" as const, message: "Choose a username." };
    const taken = !!(await prisma.playerProfile.findUnique({ where: { username: wanted }, select: { id: true } }));
    const bad = usernameChecks(wanted, taken).find((c) => !c.ok);
    if (bad) return { error: "username_invalid" as const, message: bad.message };
    username = wanted;
  }

  let birthDate = current?.birthDate ?? null;
  if (!birthDate) {
    if (!input.birthDate) {
      return { error: "birth_date_required" as const, message: "Enter your date of birth." };
    }
    const parsed = parseBirthDate(input.birthDate);
    if (!parsed) {
      return { error: "validation_error" as const, message: "Enter a valid date of birth." };
    }
    // Under the platform floor: say so and keep nothing, so no date is stored.
    if (ageOn(parsed) < PLATFORM_MIN_AGE) {
      return {
        error: "under_age" as const,
        message: `BattleKrypt is for players aged ${PLATFORM_MIN_AGE} and over.`,
      };
    }
    birthDate = parsed;
  }

  const displayName = `${input.firstName.trim()} ${input.lastName.trim()}`;

  let user, playerProfile;
  try {
  [user, playerProfile] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        displayName, // kept in sync — Nav, admin views, etc. already read this
        ...(input.avatarUrl && { avatarUrl: input.avatarUrl }),
      },
    }),
    prisma.playerProfile.update({
      where: { userId },
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        ...(username && { username }),
        mobileNumber: input.mobileNumber || null,
        region: input.region || null,
        country: input.country || null,
        city: input.city || null,
        birthDate,
        age: ageOn(birthDate), // kept in step for older screens
        gender: input.gender || null,
        hobbies: input.hobbies || null,
        favoriteGames: input.favoriteGames ?? [],
        playStyle: input.playStyle ?? null,
      },
    }),
  ]);
  } catch (e) {
    // Someone took the username between the check above and the save.
    if (username && typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      return { error: "username_invalid" as const, message: "That username was just taken. Pick another." };
    }
    throw e;
  }

  return { data: { user, playerProfile } };
}

// ------------------------------------------------------------
// ORGANIZER PROFILE
// ------------------------------------------------------------

export async function getOrganizerByUserId(userId: string) {
  return prisma.organizerProfile.findUnique({
    where: { userId },
    include: { user: { select: { kycStatus: true, displayName: true } } },
  });
}

export async function getPublicOrganizerProfile(organizerId: string) {
  const organizer = await prisma.organizerProfile.findUnique({
    where: { id: organizerId },
    include: { user: { select: { kycStatus: true } }, identity: { select: { status: true, validUntil: true } } },
  });
  if (!organizer) return null;

  // "Tournaments Hosted" per spec §10 is completed-only, not every
  // tournament ever created (a pile of drafts/cancellations shouldn't
  // count toward credibility).
  const completedTournaments = await prisma.tournament.findMany({
    where: { organizerId, status: "completed" },
    select: { prizePoolAmount: true, prizePoolCurrency: true, payoutConfirmed: true },
  });

  // "Total Prize Pool Distributed" — payout-confirmed only (spec §10), so
  // a prize pool that's merely been announced doesn't count until the
  // organizer confirms it actually went out. Broken down per currency
  // rather than force-converted (spec §6) — formatMoneyBreakdown handles
  // the actual per-currency grouping/display.
  const prizeDistributed = completedTournaments
    .filter((t) => t.payoutConfirmed && t.prizePoolAmount && t.prizePoolCurrency)
    .map((t) => ({ amount: t.prizePoolAmount!, currency: t.prizePoolCurrency! }));

  // Like/Dislike ratio — one vote per player per tournament they actually
  // joined (spec §10), aggregated across all of the organizer's tournaments.
  const voteCounts = await prisma.tournamentVote.groupBy({
    by: ["value"],
    where: { tournament: { organizerId } },
    _count: true,
  });
  const likes = voteCounts.find((v) => v.value === "like")?._count ?? 0;
  const dislikes = voteCounts.find((v) => v.value === "dislike")?._count ?? 0;

  const paid = await getPaidPlanCodes();

  return {
    ...organizer,
    verified: holdsPaidPlan(organizer, paid) && isIdentityVerified(organizer.identity),
    tournamentsHosted: completedTournaments.length,
    prizeDistributed,
    likes,
    dislikes,
  };
}

// Organizer confirms prize money for a completed tournament has actually
// gone out. Only meaningful once the tournament is completed and has a
// prize pool — confirming payout on a still-running or prizeless
// tournament doesn't mean anything (see Tournament.payoutConfirmed).
export async function markPayoutConfirmed(tournamentId: string, userId: string) {
  // Delegates to organizer-trust: besides flipping Tournament.payoutConfirmed,
  // each winner now gets a payout record to confirm or dispute.
  return markPrizesPaid(tournamentId, userId);
}

// A player may vote once they hold ANY registration for this tournament —
// as themselves, or as a member of a club team entry — regardless of that
// registration's current status (spec §10: "tied to registration record —
// can't be gamed by non-participants"; being later disqualified doesn't
// retroactively strip standing to rate the event they played in).
async function hasJoinedTournament(tournamentId: string, playerId: string) {
  const registration = await prisma.registration.findFirst({
    where: {
      tournamentId,
      OR: [
        { playerId },
        { teamEntry: { members: { some: { playerId } } } },
      ],
    },
    select: { id: true },
  });
  return registration !== null;
}

export async function voteOnTournament(
  tournamentId: string,
  playerId: string,
  value: "like" | "dislike"
) {
  if (!(await hasJoinedTournament(tournamentId, playerId))) {
    return { error: "not_joined" as const };
  }
  const vote = await prisma.tournamentVote.upsert({
    where: { tournamentId_playerId: { tournamentId, playerId } },
    create: { tournamentId, playerId, value },
    update: { value },
  });
  return { data: vote };
}

export async function getTournamentVoteSummary(tournamentId: string, playerId?: string) {
  const [counts, myVote] = await Promise.all([
    prisma.tournamentVote.groupBy({ by: ["value"], where: { tournamentId }, _count: true }),
    playerId
      ? prisma.tournamentVote.findUnique({
        where: { tournamentId_playerId: { tournamentId, playerId } },
      })
      : Promise.resolve(null),
  ]);
  return {
    likes: counts.find((v) => v.value === "like")?._count ?? 0,
    dislikes: counts.find((v) => v.value === "dislike")?._count ?? 0,
    myVote: myVote?.value ?? null,
  };
}

// Basic shareable-link click tracking (spec §3). Fire-and-forget, called
// from a client component on actual mount so Next.js Link prefetches
// (which don't run page JS) don't inflate the count.
export async function incrementTournamentClick(idOrSlug: string) {
  await prisma.tournament
    .updateMany({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      data: { clickCount: { increment: 1 } },
    })
    .catch(() => null);
}

export async function updateOrganizerProfile(
  organizerId: string,
  userId: string,
  input: { orgName?: string; bio?: string; socialLinks?: unknown }
) {
  const organizer = await prisma.organizerProfile.findUnique({ where: { id: organizerId } });
  if (!organizer) return { error: "not_found" as const };
  if (organizer.userId !== userId) return { error: "forbidden" as const };

  const updated = await prisma.organizerProfile.update({
    where: { id: organizerId },
    data: {
      ...(input.orgName && { orgName: input.orgName }),
      ...(input.bio !== undefined && { bio: input.bio }),
      ...(input.socialLinks !== undefined && { socialLinks: input.socialLinks as Prisma.InputJsonValue }),
    },
  });
  return { data: updated };
}

export async function getMyGameRequests(organizerId: string) {
  return prisma.gameRequest.findMany({
    where: { organizerId },
    orderBy: { createdAt: "desc" },
  });
}

// ------------------------------------------------------------
// REGISTRATION DETAIL / DISQUALIFY
// ------------------------------------------------------------

export async function getRegistrationById(
  registrationId: string,
  requesterUserId: string
) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      tournament: { include: { organizer: true } },
      player: { include: { user: { select: { displayName: true } } } },
      teamEntry: { include: { members: true } },
    },
  });
  if (!registration) return { error: "not_found" as const };

  // Access control: only the organizer who owns the tournament, or the
  // player who owns the registration, can view it.
  const isOwningOrganizer = registration.tournament.organizer.userId === requesterUserId;

  const player = await prisma.playerProfile.findUnique({ where: { userId: requesterUserId } });
  const isOwningPlayer = player?.id === registration.playerId;

  if (!isOwningOrganizer && !isOwningPlayer) {
    return { error: "forbidden" as const };
  }

  return { data: registration };
}

// Disqualifying (and the other penalties) live in penalties.ts: the host can act
// on any entry, a co-host institute on its own. Re-exported for existing imports.
export { disqualifyRegistration } from "@/lib/services/penalties";

// ------------------------------------------------------------
// MODERATION — lightweight flag/report stub
// ------------------------------------------------------------

export async function flagTournament(tournamentId: string, reporterId: string, reason: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };

  const flag = await prisma.tournamentFlag.create({
    data: { tournamentId, reporterId, reason },
  });
  return { data: flag };
}

export async function listFlaggedTournaments() {
  return prisma.tournament.findMany({
    where: { flags: { some: { resolved: false } } },
    include: {
      organizer: true,
      flags: { where: { resolved: false }, orderBy: { createdAt: "desc" } },
    },
  });
}

// S/National-tier tournaments an organizer has submitted for the
// admin-review publish path (spec §9) — see publishTournament's
// submittedForReview branch. Still "draft" until an admin acts.
export async function listPendingTierReviewTournaments() {
  return prisma.tournament.findMany({
    where: { status: "draft", submittedForReview: true },
    include: { organizer: true, game: true },
    orderBy: { updatedAt: "asc" },
  });
}

export async function approveTierReview(tournamentId: string, adminId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };
  if (!tournament.submittedForReview) return { error: "not_pending" as const };

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "published", submittedForReview: false },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "approved_tier_publish",
      targetType: "Tournament",
      targetId: tournamentId,
    },
  });

  return { data: updated };
}

// Rejecting doesn't cancel the tournament — it stays a draft the organizer
// can revise (lower the tier, adjust the prize pool, etc.) and resubmit.
export async function rejectTierReview(tournamentId: string, adminId: string, reason?: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };
  if (!tournament.submittedForReview) return { error: "not_pending" as const };

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { submittedForReview: false },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "rejected_tier_publish",
      targetType: "Tournament",
      targetId: tournamentId,
      notes: reason,
    },
  });

  return { data: updated };
}

// ------------------------------------------------------------
// STATUS TRANSITIONS
// ------------------------------------------------------------

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  published: ["registration_open", "registration_closed", "in_progress"],
  registration_open: ["registration_closed", "in_progress"],
  registration_closed: ["in_progress"],
  in_progress: ["completed"],
};

export async function updateTournamentStatus(
  tournamentId: string,
  organizerId: string,
  newStatus: string
) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };
  if (tournament.organizerId !== organizerId) return { error: "forbidden" as const };

  const allowed = ALLOWED_STATUS_TRANSITIONS[tournament.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return { error: "invalid_transition" as const, allowed };
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: newStatus as TournamentStatus, ...(newStatus === "completed" ? { completedAt: new Date() } : {}) },
  });

  // Rating only moves once results are final (spec §9) — this transition
  // is one-way (nothing goes FROM completed back to in_progress), so this
  // only ever fires once per tournament. A placement corrected afterward
  // does NOT retroactively recompute ratings (see awardTournamentRatings).
  if (newStatus === "completed") {
    await awardTournamentRatings(tournamentId);
  }

  return { data: updated };
}

export async function resolveFlag(flagId: string, adminId: string) {
  const flag = await prisma.tournamentFlag.findUnique({ where: { id: flagId } });
  if (!flag) return { error: "not_found" as const };

  const updated = await prisma.tournamentFlag.update({
    where: { id: flagId },
    data: { resolved: true },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "resolved_flag",
      targetType: "TournamentFlag",
      targetId: flagId,
    },
  });

  return { data: updated };
}

// ------------------------------------------------------------
// MANUAL ADD — organizer adds a player directly, bypassing self-registration
// ------------------------------------------------------------

export async function manualAddRegistration(
  tournamentId: string,
  organizerId: string,
  playerEmail: string,
  paymentStatus: "paid" | "waived" = "waived"
) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { error: "not_found" as const };
  if (tournament.organizerId !== organizerId) return { error: "forbidden" as const };

  const userRecord = await prisma.user.findUnique({ where: { email: playerEmail } });
  if (!userRecord) return { error: "player_not_found" as const };

  let playerProfile = await prisma.playerProfile.findUnique({
    where: { userId: userRecord.id },
  });
  if (!playerProfile) {
    playerProfile = await prisma.playerProfile.create({ data: { userId: userRecord.id } });
  }

  // Active only (see registerForTournament) — a previously rejected/DQ'd
  // registration shouldn't block the organizer from manually re-adding them.
  const existing = await prisma.registration.findFirst({
    where: {
      tournamentId,
      playerId: playerProfile.id,
      status: { in: ["pending", "approved"] },
    },
  });
  if (existing) return { error: "already_registered" as const };

  // Same age gate as self-registration: an organizer can't add a player who is
  // under the tournament's minimum age, or who hasn't given a date of birth.
  const ageGate = await checkAgeGate(tournamentId, [playerProfile.id], { selfPlayerId: playerProfile.id });
  if ("error" in ageGate) return { error: ageGate.error, message: ageGate.message };

  // Same tier entry gate as self-registration (spec §9) — manual-add
  // overrides the registration window/roster-lock, not competitive
  // eligibility; an organizer can't use it to seed an S-tier bracket with
  // unrated players.
  const gate = await checkTierEntryGate(tournamentId, { playerId: playerProfile.id });
  if ("error" in gate && gate.error === "tier_gate") {
    return { error: "tier_gate" as const, message: gate.message };
  }

  // Institution-only tournaments: the player still needs a verified
  // institution (the organizer can't vouch around it), but the extra
  // per-tournament proof is skipped — adding them IS the organizer's check.
  const institutionGate = await checkInstitutionGate(tournamentId, [playerProfile.id], {
    skipProof: true,
    selfPlayerId: playerProfile.id,
  });
  if ("error" in institutionGate) {
    return { error: institutionGate.error, message: institutionGate.message };
  }

  // Organizer-added registrations skip the pending queue — the organizer
  // is directly vouching for this player, so it's approved immediately.
  const created = await prisma.$transaction(async (tx) => {
    const full = await reserveInstitutionSlot(tx, tournamentId, institutionGate.institutionId);
    if (full) return full;
    return tx.registration.create({
      data: {
        tournamentId,
        playerId: playerProfile.id,
        status: "approved",
        approvedAt: new Date(),
        addedBy: "organizer",
        paymentStatus,
        routedInstitutionId: institutionGate.routedInstitutionId,
        institutionId: institutionGate.institutionId,
      },
    });
  });
  if ("error" in created) return { error: created.error, message: created.message };
  const registration = created;

  await bumpRegistrationCount(tournamentId);
  return { data: registration };
}

export async function listOrganizers() {
  const [organizers, paid] = await Promise.all([
    prisma.organizerProfile.findMany({
      include: {
        user: { select: { kycStatus: true } },
        identity: { select: { status: true, validUntil: true } },
        _count: { select: { tournaments: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getPaidPlanCodes(),
  ]);
  return organizers.map((o) => ({
    ...o,
    verified: holdsPaidPlan(o, paid) && isIdentityVerified(o.identity),
  }));
}

// ------------------------------------------------------------
// RESULTS / STANDINGS
// ------------------------------------------------------------

export async function setRegistrationResult(
  registrationId: string,
  organizerId: string,
  placement?: number,
  points?: number
) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: true },
  });
  if (!registration) return { error: "not_found" as const };
  if (registration.tournament.organizerId !== organizerId) return { error: "forbidden" as const };

  const updated = await prisma.registration.update({
    where: { id: registrationId },
    data: {
      placement: placement ?? null,
      points: points ?? null,
    },
  });

  return { data: updated };
}

// Public standings — anyone can view, sorted by placement (nulls last),
// then by points (highest first) as a tiebreaker/fallback for tournaments
// that rank by points rather than a single final placement.
export async function getStandings(tournamentId: string) {
  const registrations = await prisma.registration.findMany({
    where: {
      tournamentId,
      status: "approved",
      OR: [{ placement: { not: null } }, { points: { not: null } }],
    },
    include: {
      player: { include: { user: { select: { displayName: true } } } },
      teamEntry: true,
    },
  });

  return registrations.sort((a, b) => {
    if (a.placement != null && b.placement != null) return a.placement - b.placement;
    if (a.placement != null) return -1;
    if (b.placement != null) return 1;
    return (b.points ?? 0) - (a.points ?? 0);
  });
}
export async function getSiteSettings() {
  return prisma.siteSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function updateSiteSettings(logoUrl: string) {
  return prisma.siteSettings.upsert({
    where: { id: "singleton" },
    update: { logoUrl },
    create: { id: "singleton", logoUrl },
  });
}

export async function listCarouselSlides() {
  return prisma.authCarouselSlide.findMany({ orderBy: { order: "asc" } });
}

export async function createCarouselSlide(input: {
  mediaUrl: string;
  mediaType: "image" | "video";
  title?: string;
  text?: string;
  order?: number;
}) {
  const count = await prisma.authCarouselSlide.count();
  return prisma.authCarouselSlide.create({
    data: {
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType,
      title: input.title,
      text: input.text,
      order: input.order ?? count,
    },
  });
}

export async function deleteCarouselSlide(id: string) {
  return prisma.authCarouselSlide.delete({ where: { id } });
}