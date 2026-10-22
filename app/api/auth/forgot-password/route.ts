// POST /api/auth/forgot-password — { email }. Always the same answer for any valid email,
// so this can't be used to find out who has an account.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, normalizeEmail } from "@/lib/validation/auth";
import { clientIp, rateLimit, tooManyChecks } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);

  const byIp = rateLimit(`forgot-ip:${clientIp(request.headers)}`, 10, 60 * 60 * 1000);
  const byEmail = rateLimit(`forgot-email:${email}`, 3, 60 * 60 * 1000);
  if (!byIp.allowed || !byEmail.allowed) {
    return NextResponse.json(
      { ok: false, checks: tooManyChecks(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec)) },
      { status: 429 }
    );
  }

  const valid = isValidEmail(email);
  const checks = [{ id: "email", ok: valid, message: "Email address is valid" }];
  if (!valid) return NextResponse.json({ ok: false, checks }, { status: 400 });

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    // Through the server callback, which swaps the emailed code for a session before
    // landing on the reset page.
    redirectTo: `${new URL(request.url).origin}/auth/callback?redirectTo=${encodeURIComponent("/reset-password")}`,
  });
  return NextResponse.json({
    ok: true,
    checks: [...checks, { id: "sent", ok: true, message: "If an account exists for that email, a reset link is on its way" }],
  });
}
