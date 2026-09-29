// GET /api/tournaments/:id — full tournament detail, public
// PATCH /api/tournaments/:id — organizer edits a draft
import { NextResponse } from "next/server";
import { getTournamentById, updateTournament } from "@/lib/services/tournaments";
import { requireOrganizer } from "@/lib/auth-helpers";
import { parseOptionalMoney } from "@/lib/money";

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

  return NextResponse.json(tournament);
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

  return NextResponse.json(result.data);
}
