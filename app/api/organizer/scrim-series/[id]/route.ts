// PATCH /api/organizer/scrim-series/:id — { action: "pause" | "resume" | "end" }
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { setSeriesStatus } from "@/lib/services/scrim-series";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  if (b.action !== "pause" && b.action !== "resume" && b.action !== "end") {
    return NextResponse.json({ error: { code: "validation_error", message: "Choose pause, resume or end." } }, { status: 400 });
  }
  const r = await setSeriesStatus(auth.organizerProfile.userId, id, b.action);
  if ("error" in r) {
    const status = r.error === "not_found" ? 404 : r.error === "forbidden" ? 403 : 409;
    return NextResponse.json({ error: { code: r.error, message: "message" in r && r.message ? r.message : "Series not found." } }, { status });
  }
  return NextResponse.json(r.data);
}
