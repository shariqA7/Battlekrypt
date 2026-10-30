// PUT /api/admin/features — flip feature switches. body: { organizerTrust?: boolean, … }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { updateFeatureFlags } from "@/lib/services/feature-flags";

export async function PUT(request: Request) {
  const auth = await requireAdmin("settings");
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await updateFeatureFlags(auth.admin.id, body);
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error, message: result.message } }, { status: 400 });
  }
  return NextResponse.json(result.data);
}
