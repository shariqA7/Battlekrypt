// POST /api/auth/org-signup — creates the login account for an organization application.
// Body: { email, password, confirmPassword, acceptTerms, acceptPrivacy, application }.
// Same standard as player sign up: every rule is checked here, on the server, and the
// answer is { ok, checks[], fieldErrors? } so the form can show ticks and crosses.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserRecord } from "@/lib/ensure-user";
import { createApplicationFromMetadata, isOrgNameAvailable } from "@/lib/services/org-applications";
import { validateOrgApplication } from "@/lib/validation/org-application";
import { allOk, coerceOrgAccount, orgAccountChecks, TERMS_VERSION } from "@/lib/validation/auth";
import { SIGNUP_META_KEY } from "@/lib/signup-profile";
import { clientIp, rateLimit, tooManyChecks } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limit = rateLimit(`org-signup:${clientIp(request.headers)}`, 8, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, checks: tooManyChecks(limit.retryAfterSec) }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, checks: [{ id: "body", ok: false, message: "Something went wrong. Please try again." }] }, { status: 400 });
  }

  const account = coerceOrgAccount(body);
  const checks = orgAccountChecks(account);
  const parsed = validateOrgApplication(body.application);
  if (!allOk(checks) || "errors" in parsed) {
    return NextResponse.json(
      { ok: false, checks, fieldErrors: "errors" in parsed ? parsed.errors : undefined },
      { status: 400 }
    );
  }

  // Check the name BEFORE creating an account, so nobody ends up with a login for an
  // application that can't be accepted.
  if (!(await isOrgNameAvailable(parsed.data.orgName))) {
    return NextResponse.json(
      { ok: false, checks, fieldErrors: { orgName: "That organization name is already taken." } },
      { status: 409 }
    );
  }

  const supabase = await createClient();
  const origin = new URL(request.url).origin;
  const { data, error } = await supabase.auth.signUp({
    email: account.email,
    password: account.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?redirectTo=${encodeURIComponent("/organizer/application")}`,
      // The application (already validated) rides along until the email is confirmed.
      data: {
        full_name: parsed.data.handlerName,
        org_application: parsed.data,
        [SIGNUP_META_KEY]: { terms: TERMS_VERSION },
      },
    },
  });

  if (error) {
    const failed =
      error.code === "weak_password"
        ? { id: "pw_policy", ok: false, message: "Password is too weak. Make it longer or less common." }
        : error.code === "over_email_send_rate_limit" || error.status === 429
        ? { id: "rate_limit", ok: false, message: "Too many emails sent. Please wait a few minutes and try again." }
        : { id: "signup", ok: false, message: "We couldn't create your account. Please try again." };
    return NextResponse.json({ ok: false, checks: [...checks, failed] }, { status: error.status === 429 ? 429 : 400 });
  }

  if (data.session && data.user) {
    await ensureUserRecord(data.user);
    await createApplicationFromMetadata(data.user);
    return NextResponse.json({ ok: true, checks, status: "signed_in", next: "/organizer/application" });
  }

  // The same answer whether or not the email already has an account, so this can't be
  // used to find out who is registered.
  return NextResponse.json({ ok: true, checks, status: "confirm_email", email: account.email });
}
