// GET /api/club/me — own club profile + approval status (+ rejection reason)
// PATCH /api/club/me — update name/logo, or resubmit fee proof after a rejection
import { NextResponse } from "next/server";
import { requireClubOwner } from "@/lib/club-helpers";
import { getLatestRejectionReason, updateClub } from "@/lib/services/clubs";

export async function GET() {
  const auth = await requireClubOwner();
  if ("response" in auth) return auth.response;

  const rejectionReason =
    auth.club.status === "rejected" ? await getLatestRejectionReason(auth.club.id) : null;

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

  if (result.error === "already_approved") {
    return NextResponse.json(
      {
        error: {
          code: "already_approved",
          message: "Your club is already approved — payment proof can't be changed.",
        },
      },
      { status: 409 }
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
