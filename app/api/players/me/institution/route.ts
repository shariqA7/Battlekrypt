// GET  /api/players/me/institution — own institute (and when it can next be changed)
// POST /api/players/me/institution — pick or change it
//   Body: { institutionId, studentId?, acknowledged? }
//   Changing an existing institute needs acknowledged=true and is allowed once a week.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { banGuard } from "@/lib/services/bans";
import {
  getInstitutionForUser,
  countActiveEntries,
  setPlayerInstitution,
  institutionChangeUnlocksAt,
  INSTITUTE_CHANGE_DAYS,
} from "@/lib/services/institutions";
import { validateInstitution } from "@/lib/validation/institution";

async function authed() {
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
  const banned = await banGuard(user.id);
  if (banned) return { response: banned } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await authed();
  if ("response" in auth) return auth.response;
  const row = await getInstitutionForUser(auth.user.id);
  if (!row) return NextResponse.json(null);
  const active = await countActiveEntries(row.playerId, auth.user.id);
  return NextResponse.json({
    activeEntries: active.total,
    institutionId: row.institutionId,
    institutionName: row.institution?.name ?? row.institutionName,
    studentId: row.studentId,
    // A legacy free-text row has no institute yet: the player must pick one.
    needsSelection: !row.institutionId,
    changeUnlocksAt: row.institutionId ? institutionChangeUnlocksAt(row.lastChangedAt) : null,
  });
}

export async function POST(request: Request) {
  const auth = await authed();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const parsed = validateInstitution(body);
  if ("errors" in parsed) {
    return NextResponse.json(
      { error: { code: "validation_error", message: Object.values(parsed.errors)[0], fields: parsed.errors } },
      { status: 400 }
    );
  }

  const result = await setPlayerInstitution(auth.user.id, parsed.data);
  if ("error" in result) {
    switch (result.error) {
      case "change_locked":
        return NextResponse.json(
          {
            error: {
              code: "change_locked",
              message: `You can change your institute once every ${INSTITUTE_CHANGE_DAYS} days.`,
              unlocksAt: "unlocksAt" in result ? result.unlocksAt : undefined,
            },
          },
          { status: 409 }
        );
      case "has_active_entries":
        return NextResponse.json(
          {
            error: {
              code: "has_active_entries",
              message:
                "You can't change your institute while you're registered in a tournament or challenge. Wait until it ends, or withdraw first.",
              tournaments: "tournaments" in result ? result.tournaments : undefined,
              challenges: "challenges" in result ? result.challenges : undefined,
            },
          },
          { status: 409 }
        );
      case "confirmation_required":
        return NextResponse.json(
          {
            error: {
              code: "confirmation_required",
              message: `Changing your institute locks it for ${INSTITUTE_CHANGE_DAYS} days. Confirm you've chosen the right one.`,
            },
          },
          { status: 409 }
        );
      case "institution_not_found":
        return NextResponse.json(
          { error: { code: result.error, message: "That institute isn't available." } },
          { status: 404 }
        );
      default:
        return NextResponse.json(
          { error: { code: result.error, message: "Complete your player profile first." } },
          { status: 400 }
        );
    }
  }
  return NextResponse.json(result.data, { status: 201 });
}
