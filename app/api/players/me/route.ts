// GET /api/players/me — own profile
// PATCH /api/players/me — update display name / avatar
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerProfileByUserId, updatePlayerProfile } from "@/lib/services/tournaments";
import { updatePlayerProfileSchema, formatZodError } from "@/lib/validation/tournaments";

export async function GET() {
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

  const profile = await getPlayerProfileByUserId(user.id);
  return NextResponse.json(profile);
}

export async function PATCH(request: Request) {
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

  const rawBody = await request.json();
  const parsed = updatePlayerProfileSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_error", message: formatZodError(parsed.error) } },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const result = await updatePlayerProfile(user.id, {
    firstName: body.firstName,
    lastName: body.lastName,
    avatarUrl: body.avatarUrl,
    mobileNumber: body.mobileNumber,
    region: body.region,
    country: body.country,
    city: body.city,
    age: body.age,
    gender: body.gender,
    hobbies: body.hobbies,
    favoriteGames: body.favoriteGames,
  });

  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: 400 }
    );
  }

  return NextResponse.json(result.data);
}
