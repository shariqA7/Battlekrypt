// Shared helpers: confirm the caller is an authenticated club owner.
// requireClubOwner — any club (pending/rejected/approved), e.g. to view status.
// requireApprovedClub — only admin-approved clubs; use this for anything that
// acts as a club (sending invites, managing the roster).
import { createClient } from "@/lib/supabase/server";
import { getClubByUserId } from "@/lib/services/clubs";
import { CLUB_ERRORS, type ClubErrorCode } from "@/lib/services/club-roster";
import { NextResponse } from "next/server";

export async function requireClubOwner() {
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

  const club = await getClubByUserId(user.id);
  if (!club) {
    return {
      response: NextResponse.json(
        { error: { code: "not_club", message: "Club profile required." } },
        { status: 403 }
      ),
    } as const;
  }

  return { user, club } as const;
}

export async function requireApprovedClub() {
  const auth = await requireClubOwner();
  if ("response" in auth) return auth;

  if (auth.club.status !== "approved") {
    return {
      response: NextResponse.json(
        {
          error: {
            code: "club_not_approved",
            message: "Your club must be approved by an admin first.",
          },
        },
        { status: 403 }
      ),
    } as const;
  }

  return auth;
}

// Turns a club-roster service failure ({ error, message? }) into a JSON
// response with the right status code and a user-facing message.

export function clubError(result: { error: ClubErrorCode; message?: string }) {
  const def = CLUB_ERRORS[result.error];
  return NextResponse.json(
    { error: { code: result.error, message: result.message ?? def.message } },
    { status: def.status }
  );
}
