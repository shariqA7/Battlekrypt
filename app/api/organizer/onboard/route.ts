// POST /api/organizer/onboard — self-upgrade from Player to Organizer.
// Creates the OrganizerProfile immediately, but publishing stays locked
// until admin approval (User.kycStatus === "approved") — see the
// /tournaments/:id/publish route for where that gate is enforced.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ensureUserRecord } from "@/lib/ensure-user";

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

  const existing = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });
  if (existing) {
    return NextResponse.json(
      { error: { code: "already_organizer", message: "You already have an organizer profile." } },
      { status: 409 }
    );
  }

  const body = await request.json();
  if (!body.orgName) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "orgName is required." } },
      { status: 400 }
    );
  }

  // Defensive fallback — should already exist from the auth callback, but
  // this guards against edge cases (e.g. a session created before this
  // helper existed).
  await ensureUserRecord(user);

  const organizerProfile = await prisma.organizerProfile.create({
    data: {
      userId: user.id,
      orgName: body.orgName,
      bio: body.bio,
    },
  });

  return NextResponse.json(organizerProfile, { status: 201 });
}
