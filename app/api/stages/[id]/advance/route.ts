// POST   /api/stages/:id/advance — organizer advances entries into this stage
//        Body: { registrationIds: string[] }  or  { top: number } (by points, then placement)
// DELETE /api/stages/:id/advance — body { registrationId } removes one entry from the stage
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { advanceToStage, removeFromStage } from "@/lib/services/stages";

function fail(result: { error: string; message?: string }) {
  const status = result.error === "not_found" ? 404 : result.error === "forbidden" ? 403 : result.error === "validation" || result.error === "invalid_entries" ? 400 : 409;
  return NextResponse.json({ error: { code: result.error, message: result.message ?? "Couldn't update the stage." } }, { status });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const registrationIds = Array.isArray(body.registrationIds) ? body.registrationIds.filter((x: unknown) => typeof x === "string") : undefined;
  const top = Number.isInteger(body.top) ? (body.top as number) : undefined;

  const result = await advanceToStage(id, auth.organizerProfile.id, { registrationIds, top });
  if ("error" in result) return fail(result);
  return NextResponse.json(result.data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (typeof body.registrationId !== "string") {
    return NextResponse.json({ error: { code: "validation_error", message: "registrationId is required." } }, { status: 400 });
  }
  const result = await removeFromStage(id, auth.organizerProfile.id, body.registrationId);
  if ("error" in result) return fail(result);
  return NextResponse.json(result.data);
}
