// POST /api/auth/resend — { email, redirectTo? }. Sends the sign-up confirmation email again.
// The answer is the same for any valid email, so it can't be used to find out who has an account.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, normalizeEmail } from "@/lib/validation/auth";
import { clientIp, rateLimit, tooManyChecks } from "@/lib/rate-limit";
import { safeRedirect } from "@/lib/safe-redirect";
import { captchaCheck, verifyCaptcha } from "@/lib/captcha";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);

  const byIp = await rateLimit(`resend-ip:${clientIp(request.headers)}`, 10, 60 * 60 * 1000);
  const byEmail = await rateLimit(`resend-email:${email}`, 3, 60 * 60 * 1000);
  if (!byIp.allowed || !byEmail.allowed) {
    return NextResponse.json({ ok: false, checks: tooManyChecks(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec)) }, { status: 429 });
  }

  const human = await verifyCaptcha(body.captchaToken, clientIp(request.headers));
  if (!human.ok) return NextResponse.json({ ok: false, checks: [captchaCheck(human)] }, { status: 400 });

  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, checks: [{ id: "email", ok: false, message: "Email address is valid" }] }, { status: 400 });
  }

  const redirectTo = safeRedirect(typeof body.redirectTo === "string" ? body.redirectTo : null);
  const supabase = await createClient();
  await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${new URL(request.url).origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}` },
  });
  return NextResponse.json({
    ok: true,
    checks: [{ id: "sent", ok: true, message: "If that email is waiting to be confirmed, we sent a new link" }],
  });
}
