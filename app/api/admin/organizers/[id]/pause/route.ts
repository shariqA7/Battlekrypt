// POST /api/admin/organizers/:id/pause — { paused: boolean, note }
// Pause or resume an organizer's new paid registrations and new paid or prized events.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { setOrganizerPause } from "@/lib/services/organizer-reports";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("organizations");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  if (typeof b.paused !== "boolean") {
    return NextResponse.json({ error: { code: "validation_error", message: "paused must be true or false." } }, { status: 400 });
  }
  const result = await setOrganizerPause({ adminId: auth.admin.id, organizerId: id, paused: b.paused, note: String(b.note ?? "") });
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error, message: "message" in result && result.message ? result.message : "Organizer not found." } }, { status: result.error === "not_found" ? 404 : 400 });
  }
  return NextResponse.json(result.data);
}
