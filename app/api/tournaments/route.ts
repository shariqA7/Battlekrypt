// GET  /api/tournaments  — public browse/search/filter
// POST /api/tournaments  — organizer creates a draft tournament
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listTournaments, createTournament } from "@/lib/services/tournaments";

import { resolveCreateMoney } from "@/lib/money";
import { parseRuleList } from "@/lib/rules";
import { PlanLimitError } from "@/lib/services/plan-gates";
import { banGuard } from "@/lib/services/bans";

function moneyError(message: string) {
  return NextResponse.json(
    { error: { code: "validation_error", message } },
    { status: 400 }
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const result = await listTournaments({
    game: searchParams.get("game") ?? undefined,
    type: (searchParams.get("type") as never) ?? undefined,
    mode: (searchParams.get("mode") as never) ?? undefined,
    entryType: (searchParams.get("entryType") as never) ?? undefined,
    audienceScope: (searchParams.get("audienceScope") as never) ?? undefined,
    search: searchParams.get("search") ?? undefined,
    page: Number(searchParams.get("page")) || undefined,
    limit: Number(searchParams.get("limit")) || undefined,
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Sign in required." } },
      { status: 401 }
    );
  }

  const banned = await banGuard(user.id);
  if (banned) return banned;

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });

  if (!organizerProfile) {
    return NextResponse.json(
      {
        error: {
          code: "not_organizer",
          message: "Complete organizer onboarding before creating tournaments.",
        },
      },
      { status: 403 }
    );
  }

  const body = await request.json();

  // NOTE: this is intentionally minimal validation for the scaffold.
  // Before real use, replace with a schema validator (e.g. zod) matching
  // the payload shape documented in api-contract-phase1.md.
  if (!body.gameId || !body.name || !body.type || !body.mode || !body.maxTeams || !body.format || !body.entryType) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Missing required fields." } },
      { status: 400 }
    );
  }

  // Money: the API is public and the DB accepts any string, so enforce the
  // supported currencies / sane amounts here, not just in the form.
  const money = resolveCreateMoney({
    entryType: body.entryType,
    entryFee: body.entryFee,
    prizePool: body.prizePool,
  });
  if (!money.ok) return moneyError(money.message);

  // Rules: structured objects, or plain strings from older clients.
  const rules = parseRuleList(body.rules);
  if (!rules.ok) return moneyError(rules.message);

  const VALID_TIERS = ["none", "D", "C", "B", "A", "S", "National"];
  if (body.competitiveTier !== undefined && !VALID_TIERS.includes(body.competitiveTier)) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "competitiveTier must be one of none/D/C/B/A/S/National." } },
      { status: 400 }
    );
  }

  if (body.audienceScope !== undefined && !["open", "institution"].includes(body.audienceScope)) {
    return moneyError("audienceScope must be open or institution.");
  }

  const tournament = await createTournament({
    organizerId: organizerProfile.id,
    gameId: body.gameId,
    name: body.name,
    description: body.description,
    bannerUrl: body.bannerUrl,
    type: body.type,
    mode: body.mode,
    maxTeamSize: body.maxTeamSize,
    maxTeams: body.maxTeams,
    playersPerRoom: body.playersPerRoom,
    format: body.format,
    entryType: body.entryType,
    entryFeeAmount: money.entryFee?.amount,
    entryFeeCurrency: money.entryFee?.currency,
    paymentInstructions: body.paymentInstructions,
    prizePoolAmount: money.prizePool?.amount,
    prizePoolCurrency: money.prizePool?.currency,
    competitiveTier: body.competitiveTier,
    audienceScope: body.audienceScope,
    requireFreshInstitutionProof: body.requireFreshInstitutionProof === true,
    customFields: body.customFields,
    rules: rules.value,
    startAt: body.startAt ? new Date(body.startAt) : undefined,
  }).catch((err: unknown) => {
    // Plan limits (tournaments per month / games hosted) come back as a 403.
    if (err instanceof PlanLimitError) return err;
    throw err;
  });

  if (tournament instanceof PlanLimitError) {
    return NextResponse.json(
      { error: { code: tournament.code, message: tournament.message } },
      { status: 403 }
    );
  }

  return NextResponse.json(tournament, { status: 201 });
}
