// POST /api/organizations/apply — submit an organization application for the
// signed-in account. (New accounts are created by the form first; with
// "Confirm email" on, the application is created after confirmation instead —
// see createApplicationFromMetadata.)
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { banGuard } from "@/lib/services/bans";
import { ensureUserRecord } from "@/lib/ensure-user";
import { validateOrgApplication } from "@/lib/validation/org-application";
import { createApplication } from "@/lib/services/org-applications";

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

  const parsed = validateOrgApplication(await request.json().catch(() => null));
  if ("errors" in parsed) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Please fix the highlighted fields.", fields: parsed.errors } },
      { status: 400 }
    );
  }

  await ensureUserRecord(user);
  const result = await createApplication(user.id, parsed.data);

  if ("error" in result) {
    const status = result.error === "name_taken" ? 409 : result.error === "validation_error" ? 400 : 409;
    const messages: Record<string, string> = {
      already_organizer: "This account is already an approved organizer.",
      already_applied: "This account already has an organization application.",
      name_taken: "That organization name is already taken.",
    };
    return NextResponse.json(
      { error: { code: result.error, message: messages[result.error] ?? "Couldn't submit.", fields: result.errors } },
      { status }
    );
  }
  return NextResponse.json({ status: "pending" }, { status: 201 });
}
