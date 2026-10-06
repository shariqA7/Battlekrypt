// POST /api/registrations/:id/check-in — organizer marks an entry
// Body: { status: "checked_in" | "no_show" | "pending" }  ("pending" = undo)
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { setCheckInStatus } from "@/lib/services/venue";

const STATUSES = ["checked_in", "no_show", "pending"] as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (!STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "status must be checked_in, no_show or pending." } },
      { status: 400 }
    );
  }

  const result = await setCheckInStatus(id, auth.organizerProfile.id, body.status);
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "forbidden" ? 403 : 409;
    return NextResponse.json(
      { error: { code: result.error, message: result.message ?? "Couldn't update check-in." } },
      { status }
    );
  }
  return NextResponse.json(result.data);
}
