// PUT /api/organizations/application — a rejected applicant sends the
// corrected application back. Enforced server-side: 2 hours after the first
// rejection, 24 hours after the second, 7 days after the third and later.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { banGuard } from "@/lib/services/bans";
import { validateOrgApplication } from "@/lib/validation/org-application";
import { resubmitApplication } from "@/lib/services/org-applications";

export async function PUT(request: Request) {
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

  const result = await resubmitApplication(user.id, parsed.data);
  if ("error" in result) {
    if (result.error === "too_soon") {
      return NextResponse.json(
        { error: { code: "too_soon", message: "You can't resubmit yet.", retryAt: result.retryAt } },
        { status: 429 }
      );
    }
    const messages: Record<string, string> = {
      not_found: "No application found for this account.",
      not_rejected: "Only a rejected application can be resubmitted.",
      name_taken: "That organization name is already taken.",
    };
    return NextResponse.json(
      { error: { code: result.error, message: messages[result.error] ?? "Couldn't resubmit.", fields: result.errors } },
      { status: result.error === "not_found" ? 404 : 409 }
    );
  }
  return NextResponse.json({ status: "pending" });
}
