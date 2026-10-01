// GET /api/club/me — own club profile + approval status (+ rejection reason)
// PATCH /api/club/me — update name/logo, or send payment proof to upgrade to the paid plan
import { NextResponse } from "next/server";
import { requireClubOwner } from "@/lib/club-helpers";
import { getLatestRejectionReason, updateClub } from "@/lib/services/clubs";

export async function GET() {
  const auth = await requireClubOwner();
  if ("response" in auth) return auth.response;

  const rejectionReason =
    auth.club.upgradeStatus === "rejected" ? await getLatestRejectionReason(auth.club.id) : null;

  return NextResponse.json({ ...auth.club, rejectionReason });
}

export async function PATCH(request: Request) {
  const auth = await requireClubOwner();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));

  const update: { clubName?: string; logoUrl?: string | null; feeProofUrl?: string } = {};

  if (body.clubName !== undefined) {
    const clubName = typeof body.clubName === "string" ? body.clubName.trim() : "";
    if (clubName.length < 2 || clubName.length > 60) {
      return NextResponse.json(
        {
          error: {
            code: "validation_error",
            message: "Club name must be between 2 and 60 characters.",
          },
        },
        { status: 400 }
      );
    }
    update.clubName = clubName;
  }

  if (body.logoUrl !== undefined) {
    update.logoUrl = typeof body.logoUrl === "string" && body.logoUrl ? body.logoUrl : null;
  }

  if (body.feeProofUrl !== undefined) {
    if (typeof body.feeProofUrl !== "string" || !body.feeProofUrl.startsWith("http")) {
      return NextResponse.json(
        { error: { code: "validation_error", message: "Invalid payment proof." } },
        { status: 400 }
      );
    }
    update.feeProofUrl = body.feeProofUrl;
  }

  const result = await updateClub(auth.club.id, update);

  if (result.error === "name_taken") {
    return NextResponse.json(
      {
        error: {
          code: "name_taken",
          message: result.check.ok ? "Name unavailable." : result.check.message,
          canClaim: result.check.ok ? false : result.check.canClaim,
        },
      },
      { status: 409 }
    );
  }
  if (result.error === "already_paid" || result.error === "upgrade_pending") {
    return NextResponse.json(
      {
        error: {
          code: result.error,
          message:
            result.error === "already_paid"
              ? "Your club is already on a paid plan."
              : "Your payment is already waiting for review.",
        },
      },
      { status: 409 }
    );
  }
  if (result.error === "not_active") {
    return NextResponse.json(
      { error: { code: "not_active", message: "This club is no longer active." } },
      { status: 403 }
    );
  }
  if (result.error) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Club not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json(result.data);
}
