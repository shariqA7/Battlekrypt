import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { disqualifyRegistration } from "@/lib/services/tournaments";

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

  const result = await disqualifyRegistration(id, auth.organizerProfile.id, body.reason, body.ruleId);

  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Registration not found." } },
      { status: 404 }
    );
  }
  if (result.error === "forbidden") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "You don't own this tournament." } },
      { status: 403 }
    );
  }

  return NextResponse.json(result.data);
}
