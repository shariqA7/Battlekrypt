// PATCH /api/organizer/scrim-series/bookings/:id — { action: "approve" | "reject", reason? }
// Approves or rejects every session of a booking at once.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { approveBooking, rejectBooking } from "@/lib/services/series-booking";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const userId = auth.organizerProfile.userId;
  const r = b.action === "approve" ? await approveBooking(userId, id)
    : b.action === "reject" ? await rejectBooking(userId, id, b.reason)
    : { error: "validation_error", message: "Choose approve or reject." };
  if ("error" in r) {
    const status = r.error === "not_found" ? 404 : r.error === "forbidden" ? 403 : r.error === "invalid_status" ? 409 : 400;
    return NextResponse.json({ error: { code: r.error, message: ("message" in r && r.message) || "Booking not found." } }, { status });
  }
  return NextResponse.json(r.data);
}
