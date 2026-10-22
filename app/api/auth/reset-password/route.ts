// POST /api/auth/reset-password — { password, confirmPassword }. Needs the temporary
// session the emailed recovery link creates.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allOk, resetChecks } from "@/lib/validation/auth";
import { clientIp, rateLimit, tooManyChecks } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limit = rateLimit(`reset:${clientIp(request.headers)}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, checks: tooManyChecks(limit.retryAfterSec) }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, checks: [{ id: "session", ok: false, message: "This reset link has expired. Request a new one." }] },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  const checks = resetChecks(password, confirm, { email: user.email ?? "" });
  if (!allOk(checks)) return NextResponse.json({ ok: false, checks }, { status: 400 });

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const message =
      error.code === "same_password"
        ? "Choose a password you haven't used before"
        : error.code === "weak_password"
        ? "Password is too weak. Make it longer or less common."
        : "Couldn't update your password. The link may have expired. Request a new one.";
    return NextResponse.json({ ok: false, checks: [...checks, { id: "update", ok: false, message }] }, { status: 400 });
  }
  return NextResponse.json({ ok: true, checks: [...checks, { id: "update", ok: true, message: "Password updated" }] });
}
