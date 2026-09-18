// GET /api/organizer/me — own organizer profile + approval status
// PATCH /api/organizer/me — update orgName / bio / socialLinks
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerByUserId, updateOrganizerProfile } from "@/lib/services/tournaments";

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

  const organizer = await getOrganizerByUserId(user.id);
  if (!organizer) {
    return NextResponse.json(
      { error: { code: "not_organizer", message: "Organizer profile required." } },
      { status: 403 }
    );
  }

  return NextResponse.json(organizer);
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

  const organizer = await getOrganizerByUserId(user.id);
  if (!organizer) {
    return NextResponse.json(
      { error: { code: "not_organizer", message: "Organizer profile required." } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const result = await updateOrganizerProfile(organizer.id, user.id, {
    orgName: body.orgName,
    bio: body.bio,
    socialLinks: body.socialLinks,
  });

  if (result.error) {
    return NextResponse.json(
      { error: { code: result.error, message: "Unable to update profile." } },
      { status: result.error === "forbidden" ? 403 : 404 }
    );
  }

  return NextResponse.json(result.data);
}
