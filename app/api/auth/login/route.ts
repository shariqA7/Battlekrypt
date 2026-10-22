// POST /api/auth/login — { email, password, redirectTo? } -> { ok, checks[], next? }
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserRecord } from "@/lib/ensure-user";
import { createApplicationFromMetadata } from "@/lib/services/org-applications";
import { prisma } from "@/lib/prisma";
import { allOk, loginChecks, normalizeEmail } from "@/lib/validation/auth";
import { clientIp, rateLimit, tooManyChecks } from "@/lib/rate-limit";
import { safeRedirect } from "@/lib/safe-redirect";
import { requestSignupConsent } from "@/lib/services/parental-consent";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const redirectTo = safeRedirect(typeof body.redirectTo === "string" ? body.redirectTo : null);

  const ip = clientIp(request.headers);
  const byIp = rateLimit(`login-ip:${ip}`, 30, 15 * 60 * 1000);
  const byAccount = rateLimit(`login-acct:${email}`, 8, 15 * 60 * 1000);
  if (!byIp.allowed || !byAccount.allowed) {
    const wait = Math.max(byIp.retryAfterSec, byAccount.retryAfterSec);
    return NextResponse.json({ ok: false, checks: tooManyChecks(wait) }, { status: 429 });
  }

  const checks = loginChecks(email, password);
  if (!allOk(checks)) {
    return NextResponse.json({ ok: false, checks }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // One message for "no such account" and "wrong password", so emails can't be probed.
    const message =
      error?.code === "email_not_confirmed"
        ? "Confirm your email first. Check your inbox for the link we sent."
        : "Email or password is incorrect";
    return NextResponse.json(
      { ok: false, checks: [...checks, { id: "credentials", ok: false, message }] },
      { status: 401 }
    );
  }

  await ensureUserRecord(data.user);
  await requestSignupConsent(data.user.id, new URL(request.url).origin).catch(() => undefined);
  await createApplicationFromMetadata(data.user);
  const profile = await prisma.playerProfile.findUnique({
    where: { userId: data.user.id },
    select: { birthDate: true, username: true },
  });
  // Someone who signed up with a social login and never gave a date of birth finishes
  // their profile first; everyone else goes where they were headed.
  const next = profile?.birthDate && profile?.username ? redirectTo : `/onboarding?redirectTo=${encodeURIComponent(redirectTo)}`;
  return NextResponse.json({ ok: true, checks: [...checks, { id: "credentials", ok: true, message: "Signed in" }], next });
}
