// GET  /api/players/me/institution — own verification status
// POST /api/players/me/institution — submit (or fix and resubmit) it
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { banGuard } from "@/lib/services/bans";
import { getInstitutionForUser, submitInstitution } from "@/lib/services/institutions";
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
  // idImagePath is never returned to the browser.
  return NextResponse.json(
    row
      ? {
          institutionName: row.institutionName,
          studentId: row.studentId,
          status: row.status,
          adminNote: row.adminNote,
        }
      : null
  );
}

export async function POST(request: Request) {
  const auth = await authed();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const parsed = validateInstitution(body, auth.user.id);
  if ("errors" in parsed) {
    return NextResponse.json(
      { error: { code: "validation_error", message: Object.values(parsed.errors)[0], fields: parsed.errors } },
      { status: 400 }
    );
  }

  const result = await submitInstitution(auth.user.id, parsed.data);
  if ("error" in result) {
    const message =
      result.error === "already_verified"
        ? "Your institution is already verified."
        : "Complete your player profile first.";
    return NextResponse.json(
      { error: { code: result.error, message } },
      { status: result.error === "already_verified" ? 409 : 400 }
    );
  }
  return NextResponse.json(result.data, { status: 201 });
}
