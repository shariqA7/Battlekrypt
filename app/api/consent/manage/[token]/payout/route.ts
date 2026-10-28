// PUT /api/consent/manage/[token]/payout — { method, payeeName, details }. The guardian
// says where their child's prizes are paid (to the guardian, never to the child).
import { NextResponse } from "next/server";
import { saveGuardianPayout } from "@/lib/services/parental-consent";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const STATUS: Record<string, number> = { not_active: 409, not_configured: 503 };

export async function PUT(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!(await rateLimit(`consent-payout:${clientIp(request.headers)}`, 20, 60 * 60 * 1000)).allowed) {
    return NextResponse.json({ error: { code: "rate_limit", message: "Too many attempts. Please wait a while." } }, { status: 429 });
  }
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await saveGuardianPayout(token, body);
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error, message: result.message } }, { status: STATUS[result.error] ?? 400 });
  }
  return NextResponse.json(result.data);
}
