// POST /api/auth/signup — validates every field on the server, then creates the account.
// Always answers { ok, checks[] }: the form shows each check with a tick or a cross.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ensureUserRecord } from "@/lib/ensure-user";
import { allOk, coerceSignup, signupChecks, type Check } from "@/lib/validation/auth";
import { buildSignupMetadata } from "@/lib/signup-profile";
import { clientIp, rateLimit, tooManyChecks } from "@/lib/rate-limit";
import { safeRedirect } from "@/lib/safe-redirect";
import { requestSignupConsent } from "@/lib/services/parental-consent";
import { needsOnboarding } from "@/lib/services/onboarding";
import { captchaCheck, verifyCaptcha } from "@/lib/captcha";

export async function POST(request: Request) {
  const limit = await rateLimit(`signup:${clientIp(request.headers)}`, 8, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, checks: tooManyChecks(limit.retryAfterSec) }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { ok: false, checks: [{ id: "body", ok: false, message: "Something went wrong. Please try again." }] },
      { status: 400 }
    );
  }
  const human = await verifyCaptcha(body.captchaToken, clientIp(request.headers));
  if (!human.ok) return NextResponse.json({ ok: false, checks: [captchaCheck(human)] }, { status: 400 });

  const input = coerceSignup(body);
  const redirectTo = safeRedirect(typeof body.redirectTo === "string" ? body.redirectTo : null);

  // Username availability needs the database, so it is checked here, not in the shared rules.
  const usernameTaken = input.username
    ? !!(await prisma.playerProfile.findUnique({ where: { username: input.username }, select: { id: true } }))
    : false;
  const checks = signupChecks(input, { usernameTaken });
  if (!allOk(checks)) {
    return NextResponse.json({ ok: false, checks }, { status: 400 });
  }

  const supabase = await createClient();
  const origin = new URL(request.url).origin;
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      data: buildSignupMetadata(input),
    },
  });

  if (error) {
    // Supabase has its own password policy and rate limits; show those as a failed check too.
    const failed: Check =
      error.code === "weak_password"
        ? { id: "pw_policy", ok: false, message: "Password is too weak. Make it longer or less common." }
        : error.code === "over_email_send_rate_limit" || error.status === 429
        ? { id: "rate_limit", ok: false, message: "Too many emails sent. Please wait a few minutes and try again." }
        : { id: "signup", ok: false, message: "We couldn't create your account. Please try again." };
    return NextResponse.json({ ok: false, checks: [...checks, failed] }, { status: error.status === 429 ? 429 : 400 });
  }

  // "Confirm email" is off: signUp logged them in, so build their profile now.
  if (data.session && data.user) {
    await ensureUserRecord(data.user);
    await requestSignupConsent(data.user.id, origin).catch(() => undefined);
    const next = (await needsOnboarding(data.user.id))
      ? `/onboarding?redirectTo=${encodeURIComponent(redirectTo)}`
      : redirectTo;
    return NextResponse.json({ ok: true, checks, status: "signed_in", next });
  }

  // Normal path. This is also what an already-registered email gets (Supabase hides
  // the difference), so the response never reveals whether an email is taken.
  return NextResponse.json({ ok: true, checks, status: "confirm_email", email: input.email });
}
