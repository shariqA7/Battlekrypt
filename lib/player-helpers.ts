// Shared helper: confirms the caller is signed in and has a player profile
// (every account gets one on first login — see lib/ensure-user.ts).
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function requirePlayer() {
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

  const playerProfile = await prisma.playerProfile.findUnique({ where: { userId: user.id } });
  if (!playerProfile) {
    return {
      response: NextResponse.json(
        { error: { code: "no_player_profile", message: "Player profile not found." } },
        { status: 404 }
      ),
    } as const;
  }

  return { user, playerProfile } as const;
}

// Bare auth check (no PlayerProfile requirement) — for actions any signed-in
// user might take on behalf of a club they own or captain, where the caller
// isn't necessarily acting as a player.
export async function requireAuthenticatedUser() {
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

  return { user } as const;
}
