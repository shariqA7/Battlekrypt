// POST /api/consent/manage/[token] — { action: "withdraw" }. No login: the unguessable
// link from the "you approved" email is the credential, same as the approval page.
import { NextResponse } from "next/server";
import { withdrawConsent } from "@/lib/services/parental-consent";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!(await rateLimit(`consent-manage:${clientIp(request.headers)}`, 20, 60 * 60 * 1000)).allowed) {
    return NextResponse.json({ error: { code: "rate_limit", message: "Too many attempts. Please wait a while." } }, { status: 429 });
  }
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  if (body.action !== "withdraw") {
    return NextResponse.json({ error: { code: "validation_error", message: "Unknown action." } }, { status: 400 });
  }
  const result = await withdrawConsent(token);
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error, message: result.message } }, { status: result.error === "not_found" ? 404 : 400 });
  }
  return NextResponse.json(result.data);
}
