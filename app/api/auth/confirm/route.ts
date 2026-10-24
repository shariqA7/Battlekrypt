// POST /api/auth/confirm — the "Confirm" button on /auth/confirm. Verifies the one-time
// token from the email on the server and signs the person in on THIS device.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeSignIn } from "@/lib/post-login";
import { isRecovery, parseConfirmParams } from "@/lib/auth-confirm";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const see = (path: string) => NextResponse.redirect(`${origin}${path}`, 303);

  if (!rateLimit(`confirm:${clientIp(request.headers)}`, 20, 15 * 60 * 1000).allowed) {
    return see("/login?error=too_many");
  }

  const form = await request.formData().catch(() => null);
  const params = form ? parseConfirmParams((k) => (typeof form.get(k) === "string" ? (form.get(k) as string) : null), origin) : null;
  if (!params) return see("/login?error=link_expired");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: params.type, token_hash: params.tokenHash });
  if (error || !data.user) return see(isRecovery(params.type) ? "/forgot-password?error=link_expired" : "/login?error=link_expired");

  return see(await completeSignIn(data.user, origin, params.next));
}
