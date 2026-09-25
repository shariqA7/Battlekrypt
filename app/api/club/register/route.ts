// POST /api/club/register — a signed-in user registers a club.
// Creates the ClubProfile in "pending" status; an admin approves it after
// checking the registration-fee payment proof.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserRecord } from "@/lib/ensure-user";
import { getClubByUserId, registerClub } from "@/lib/services/clubs";

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

  const existing = await getClubByUserId(user.id);
  if (existing) {
    return NextResponse.json(
      { error: { code: "already_club", message: "You already have a club." } },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
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

  if (typeof body.feeProofUrl !== "string" || !body.feeProofUrl.startsWith("http")) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Proof of registration-fee payment is required.",
        },
      },
      { status: 400 }
    );
  }

  await ensureUserRecord(user);

  const club = await registerClub(user.id, {
    clubName,
    logoUrl: typeof body.logoUrl === "string" && body.logoUrl ? body.logoUrl : null,
    feeProofUrl: body.feeProofUrl,
  });

  return NextResponse.json(club, { status: 201 });
}
