// POST /api/players/me/consent/request — a player under 18 asks their parent or
// guardian for consent (sends the email). GET returns the player's current state.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { banGuard } from "@/lib/services/bans";
import { prisma } from "@/lib/prisma";
import { getConsentStateForPlayer, requestConsent } from "@/lib/services/parental-consent";

const STATUS: Record<string, number> = {
  consent_disabled: 409,
  not_found: 404,
  not_needed: 400,
  invalid_email: 400,
  same_email: 400,
  too_many: 429,
  email_not_configured: 503,
  email_failed: 502,
};

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: { code: "unauthenticated", message: "Sign in required." } }, { status: 401 }) };
  }
  const banned = await banGuard(user.id);
  if (banned) return { response: banned };
  return { user };
}

export async function GET() {
  const a = await authed();
  if ("response" in a) return a.response;
  const profile = await prisma.playerProfile.findUnique({ where: { userId: a.user.id }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: { code: "not_found", message: "Player profile not found." } }, { status: 404 });
  const { state, validUntil, guardianEmailMasked } = await getConsentStateForPlayer(profile.id);
  return NextResponse.json({ state, validUntil, guardianEmailMasked });
}

export async function POST(request: Request) {
  const a = await authed();
  if ("response" in a) return a.response;

  const body = await request.json().catch(() => ({}));
  const result = await requestConsent({
    userId: a.user.id,
    guardianEmail: typeof body.guardianEmail === "string" ? body.guardianEmail : "",
    requestedFor: typeof body.requestedFor === "string" ? body.requestedFor : null,
    origin: new URL(request.url).origin,
  });
  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: STATUS[result.error] ?? 400 }
    );
  }
  return NextResponse.json(result.data, { status: 201 });
}
