// PATCH /api/admin/site-settings — admin uploads/changes the site logo
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { updateSiteSettings } from "@/lib/services/tournaments";

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (!body.logoUrl) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "logoUrl is required." } },
      { status: 400 }
    );
  }

  const settings = await updateSiteSettings(body.logoUrl);
  return NextResponse.json(settings);
}
