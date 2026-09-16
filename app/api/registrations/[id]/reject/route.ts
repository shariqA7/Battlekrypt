// POST /api/registrations/:id/reject
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { rejectRegistration } from "@/lib/services/tournaments";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await rejectRegistration(id, auth.organizerProfile.id, body.reason);

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
