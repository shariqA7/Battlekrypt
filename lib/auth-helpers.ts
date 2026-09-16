// Shared helper: confirms the caller is an authenticated organizer who owns
// the tournament behind a given registration. Used by both approve and
// reject routes to avoid duplicating this check.
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function requireOrganizer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { error: { code: "unauthenticated", message: "Sign in required." } },
        { status: 401 }
      ),
    } as const;
  }

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });

  if (!organizerProfile) {
    return {
      response: NextResponse.json(
        { error: { code: "not_organizer", message: "Organizer profile required." } },
        { status: 403 }
      ),
    } as const;
  }

  return { organizerProfile } as const;
}
