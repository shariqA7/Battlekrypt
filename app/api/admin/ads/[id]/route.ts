// PATCH  /api/admin/ads/:id — edit a campaign, or switch it on/off with just { active }
// DELETE /api/admin/ads/:id — delete it and its counts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { deleteCampaign, updateCampaign } from "@/lib/services/ads";

const fail = (code: string, message?: string) =>
  NextResponse.json({ error: { code, message: message ?? "Campaign not found." } }, { status: code === "not_found" ? 404 : 400 });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("ads");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const r = await updateCampaign(id, b);
  if (r.error) return fail(r.error, r.message);
  return NextResponse.json(r.data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("ads");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const r = await deleteCampaign(id);
  if (r.error) return fail(r.error);
  return NextResponse.json(r.data);
}
