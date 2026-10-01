// POST /api/club/register — a signed-in player creates a club. No admin
// approval and no fee: the club is live immediately on the free plan. The name
// must not already be used by another club or an organization.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserRecord } from "@/lib/ensure-user";
import { banGuard } from "@/lib/services/bans";
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
  const banned = await banGuard(user.id);
  if (banned) return banned;

  const existing = await getClubByUserId(user.id);
  if (existing && existing.status !== "disbanded") {
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

  await ensureUserRecord(user);

  const result = await registerClub(user.id, {
    clubName,
    logoUrl: typeof body.logoUrl === "string" && body.logoUrl ? body.logoUrl : null,
  });

  if (result.error === "already_club") {
    return NextResponse.json(
      { error: { code: "already_club", message: "You already have a club." } },
      { status: 409 }
    );
  }
  if (result.error) {
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
  return NextResponse.json(result.data, { status: 201 });
}
