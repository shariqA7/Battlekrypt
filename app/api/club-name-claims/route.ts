// POST /api/club-name-claims — "that club is using my name".
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserRecord } from "@/lib/ensure-user";
import { banGuard } from "@/lib/services/bans";
import { fileClaim } from "@/lib/services/club-name-claims";

const MESSAGES = {
  invalid_name: "Enter the club name you're claiming.",
  invalid_explanation: "Explain why the name is yours (30–2000 characters).",
  invalid_evidence: "Evidence link must start with http:// or https://",
  no_holder: "No club currently uses that name — you can register it directly.",
  own_club: "That's your own club.",
  already_filed: "You already have a pending claim for this name.",
} as const;

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

  const body = await request.json().catch(() => ({}));
  await ensureUserRecord(user);
  const result = await fileClaim(user.id, {
    clubName: typeof body.clubName === "string" ? body.clubName : "",
    explanation: typeof body.explanation === "string" ? body.explanation : "",
    evidenceUrl: typeof body.evidenceUrl === "string" ? body.evidenceUrl.trim() : null,
  });

  if (result.error) {
    return NextResponse.json(
      { error: { code: result.error, message: MESSAGES[result.error] } },
      { status: result.error.startsWith("invalid") ? 400 : 409 }
    );
  }
  return NextResponse.json({ id: result.data.id, status: "pending" }, { status: 201 });
}
