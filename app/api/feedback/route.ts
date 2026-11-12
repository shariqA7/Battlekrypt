// POST /api/feedback — { kind: "feature" | "issue" | "other", message, email?, pageUrl?, captchaToken? }
// Open to visitors and signed-in users. Protected by the human check and by rate limits
// (per IP address for everyone, and per account for signed-in users).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { verifyCaptcha } from "@/lib/captcha";
import { submitFeedback } from "@/lib/services/feedback";
import { FEEDBACK_PER_DAY_BY_USER, FEEDBACK_PER_HOUR_BY_IP } from "@/lib/feedback-rules";

const HOUR = 60 * 60 * 1000;
const err = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const ip = clientIp(request.headers);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const byIp = await rateLimit(`feedback-ip:${ip}`, FEEDBACK_PER_HOUR_BY_IP, HOUR);
  const byUser = user ? await rateLimit(`feedback-user:${user.id}`, FEEDBACK_PER_DAY_BY_USER, 24 * HOUR) : { allowed: true };
  if (!byIp.allowed || !byUser.allowed) return err(429, "rate_limited", "You've sent several messages recently. Please try again later.");

  const human = await verifyCaptcha(b.captchaToken, ip);
  if (!human.ok) return err(400, "captcha", "Please complete the human check and try again.");

  const result = await submitFeedback({ userId: user?.id ?? null, kind: b.kind, message: b.message, email: b.email, pageUrl: b.pageUrl });
  if (result.error) return err(400, result.error, result.message ?? "Invalid request.");
  return NextResponse.json({ ok: true }, { status: 201 });
}
