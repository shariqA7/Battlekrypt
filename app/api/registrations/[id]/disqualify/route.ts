import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { disqualifyRegistration } from "@/lib/services/penalties";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (!body.reason) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "A disqualification reason is required." } },
      { status: 400 }
    );
  }

  const result = await disqualifyRegistration(id, auth.organizerProfile.id, String(body.reason), body.ruleId);

  if (result.error && ["reason_required", "reason_too_long"].includes(result.error)) {
    return NextResponse.json(
      { error: { code: result.error, message: result.error === "reason_required" ? "A disqualification reason is required." : "The reason is too long (500 characters at most)." } },
      { status: 400 }
    );
  }
  if (result.error && ["already_disqualified", "not_active", "closed"].includes(result.error)) {
    const msg: Record<string, string> = {
      already_disqualified: "This entry is already disqualified.",
      not_active: "Only pending or approved entries can be disqualified.",
      closed: "This tournament was cancelled.",
    };
    return NextResponse.json({ error: { code: result.error, message: msg[result.error] ?? "Couldn't disqualify this entry." } }, { status: 409 });
  }
  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Registration not found." } },
      { status: 404 }
    );
  }
  if (result.error === "forbidden") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "You can't act on this entry." } },
      { status: 403 }
    );
  }
  if (result.error === "invalid_rule") {
    return NextResponse.json(
      { error: { code: "invalid_rule", message: "That rule doesn't belong to this tournament." } },
      { status: 400 }
    );
  }

  return NextResponse.json("data" in result ? result.data : null);
}
