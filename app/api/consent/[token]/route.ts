// POST /api/consent/[token] — the guardian approves or declines. No login: the
// unguessable single-use token in the emailed link is the credential.
import { NextResponse } from "next/server";
import { decideConsent } from "@/lib/services/parental-consent";

const STATUS: Record<string, number> = {
  not_found: 404,
  already_used: 409,
  expired: 410,
  not_confirmed: 400,
  invalid_name: 400,
};

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action === "decline" ? "decline" : body.action === "approve" ? "approve" : null;
  if (!action) {
    return NextResponse.json({ error: { code: "validation_error", message: "Choose approve or decline." } }, { status: 400 });
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const result = await decideConsent(token, {
    action,
    signedName: typeof body.signedName === "string" ? body.signedName : undefined,
    confirmGuardian: body.confirmGuardian === true,
    agree: body.agree === true,
    ip: forwarded ? forwarded.split(",")[0].trim() : null,
    userAgent: request.headers.get("user-agent"),
    origin: new URL(request.url).origin,
  });
  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: STATUS[result.error] ?? 400 }
    );
  }
  return NextResponse.json(result.data);
}
