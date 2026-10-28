// PATCH /api/players/me/onboarding — { step: "about" | "games" | "style" | "finish", ...fields }
// Each step is checked on the server and answers { ok, checks[] }.
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { saveOnboardingStep } from "@/lib/services/onboarding";
import { rateLimit, tooManyChecks } from "@/lib/rate-limit";

export async function PATCH(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;

  const limit = await rateLimit(`onboarding:${auth.user.id}`, 60, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, checks: tooManyChecks(limit.retryAfterSec) }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const result = await saveOnboardingStep(auth.user.id, body, new URL(request.url).origin);
  return NextResponse.json({ ok: result.ok, checks: result.checks }, { status: result.ok ? 200 : result.status });
}
