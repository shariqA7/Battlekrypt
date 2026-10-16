// GET /api/tournaments/:id — full tournament detail, public
// PATCH /api/tournaments/:id — organizer edits a draft
import { isAgeRequirement } from "@/lib/age";
import { parentalConsentEnabled } from "@/lib/consent-config";
import { NextResponse } from "next/server";
import { getTournamentById, updateTournament } from "@/lib/services/tournaments";
import { requireOrganizer } from "@/lib/auth-helpers";
import { parseOptionalMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { parseVenue } from "@/lib/venue-input";
import { parsePrizeTiers } from "@/lib/services/prize-tiers";
import { currenciesNotEnabled } from "@/lib/services/currencies";
import { isCountryCode } from "@/lib/geo-data";
import { toPublicTournament } from "@/lib/services/venue";

function moneyError(message: string) {
  return NextResponse.json(
    { error: { code: "validation_error", message } },
    { status: 400 }
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tournament = await getTournamentById(id);

  if (!tournament) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Tournament not found." } },
      { status: 404 }
    );
  }

  // Never expose the on-site check-in code or room credentials publicly.
  return NextResponse.json(toPublicTournament(tournament));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json();

  const fee = parseOptionalMoney(body.entryFee, "Entry fee");
  if (!fee.ok) return moneyError(fee.message);
  const prize = parseOptionalMoney(body.prizePool, "Prize pool");
  if (!prize.ok) return moneyError(prize.message);
  // Only a CHANGE of currency needs to be enabled: a draft that already uses a
  // since-disabled currency can still be edited and saved as it is.
  if (fee.value || prize.value) {
    const current = await prisma.tournament.findUnique({
      where: { id },
      select: { entryFeeCurrency: true, prizePoolCurrency: true },
    });
    const disabled = await currenciesNotEnabled([
      fee.value && fee.value.currency !== current?.entryFeeCurrency ? fee.value.currency : undefined,
      prize.value && prize.value.currency !== current?.prizePoolCurrency ? prize.value.currency : undefined,
    ]);
    if (disabled) return moneyError(disabled);
  }

  if (body.country !== undefined && body.country !== null && body.country !== "" && !isCountryCode(body.country)) {
    return moneyError("country must be a supported country code, or empty for worldwide.");
  }

  const VALID_TIERS = ["none", "D", "C", "B", "A", "S", "National"];
  if (body.competitiveTier !== undefined && !VALID_TIERS.includes(body.competitiveTier)) {
    return moneyError("competitiveTier must be one of none/D/C/B/A/S/National.");
  }

  if (body.audienceScope !== undefined && !["open", "institution"].includes(body.audienceScope)) {
    return moneyError("audienceScope must be open or institution.");
  }

  if (body.minAge !== undefined && !isAgeRequirement(body.minAge)) {
    return moneyError("minAge must be 13, 16 or 18.");
  }

  if (body.requireParentalConsent !== undefined && typeof body.requireParentalConsent !== "boolean") {
    return moneyError("requireParentalConsent must be true or false.");
  }
  if (body.requireParentalConsent === true && !parentalConsentEnabled()) {
    return moneyError("Parental consent isn't switched on for this site yet.");
  }

  const tiers = body.prizeTiers === undefined ? { ok: true as const, tiers: undefined } : parsePrizeTiers(body.prizeTiers);
  if (!tiers.ok) return moneyError(tiers.message);

  const venue = parseVenue(body, { partial: true });
  if (!venue.ok) return moneyError(venue.message);

  const result = await updateTournament(id, auth.organizerProfile.id, {
    name: body.name,
    description: body.description,
    bannerUrl: body.bannerUrl,
    maxTeams: body.maxTeams,
    playersPerRoom: body.playersPerRoom,
    entryFeeAmount: fee.value?.amount,
    entryFeeCurrency: fee.value?.currency,
    paymentInstructions: body.paymentInstructions,
    prizePoolAmount: prize.value?.amount,
    prizePoolCurrency: prize.value?.currency,
    competitiveTier: body.competitiveTier,
    audienceScope: body.audienceScope,
    minAge: body.minAge,
    requireParentalConsent: body.requireParentalConsent,
    requireFreshInstitutionProof:
      typeof body.requireFreshInstitutionProof === "boolean" ? body.requireFreshInstitutionProof : undefined,
    ...venue.value,
    prizeTiers: tiers.tiers,
    country: body.country === undefined ? undefined : body.country || null,
    startAt: body.startAt ? new Date(body.startAt) : undefined,
  });

  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Tournament not found." } },
      { status: 404 }
    );
  }
  if (result.error === "forbidden") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "You don't own this tournament." } },
      { status: 403 }
    );
  }

  if (result.error === "fee_locked" || result.error === "currency_locked") {
    return NextResponse.json(
      {
        error: {
          code: result.error,
          message:
            result.error === "fee_locked"
              ? "Players have already registered, so the entry fee can no longer be changed."
              : "Players have already registered, so the prize pool currency can no longer be changed.",
        },
      },
      { status: 409 }
    );
  }
  if (result.error === "invalid_fee") {
    return moneyError("A paid tournament needs an entry fee greater than zero.");
  }
  if (result.error === "invalid_prize_tiers") {
    return moneyError(result.message);
  }
  if (result.error === "prize_locked") {
    return NextResponse.json(
      { error: { code: "prize_locked", message: "Players have already registered, so the prize split can no longer change." } },
      { status: 409 }
    );
  }
  if (result.error === "venue_locked") {
    return NextResponse.json(
      {
        error: {
          code: "venue_locked",
          message: "Players have already registered, so this can no longer switch between Online and LAN.",
        },
      },
      { status: 409 }
    );
  }
  if (result.error === "invalid_check_in_window") {
    return moneyError(result.message);
  }
  if (result.error === "audience_locked") {
    return NextResponse.json(
      {
        error: {
          code: "audience_locked",
          message: "Players have already registered, so who can enter can no longer be changed.",
        },
      },
      { status: 409 }
    );
  }
  if (result.error === "age_locked") {
    return NextResponse.json(
      {
        error: {
          code: "age_locked",
          message: "Players have already registered, so the age requirement can no longer be changed.",
        },
      },
      { status: 409 }
    );
  }
  if (result.error === "tier_locked") {
    return NextResponse.json(
      {
        error: {
          code: "tier_locked",
          message: "The competitive tier can only be changed while this tournament is still a draft.",
        },
      },
      { status: 409 }
    );
  }

  return NextResponse.json(result.data);
}
