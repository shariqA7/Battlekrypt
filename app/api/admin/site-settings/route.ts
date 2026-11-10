// PATCH /api/admin/site-settings — admin uploads/changes/clears brand assets.
// Body: any of logoUrl, logoLightUrl, shareImageUrl, defaultBannerUrl,
// defaultAvatarUrl, defaultOrgLogoUrl (https URL, or null/"" to clear).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { updateSiteSettings } from "@/lib/services/tournaments";
import { BRANDING_KEYS, cleanAssetUrl } from "@/lib/services/branding";

export async function PATCH(request: Request) {
  const auth = await requireAdmin("settings");
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, string | null> = {};
  for (const key of BRANDING_KEYS) {
    if (!(key in body)) continue;
    const value = cleanAssetUrl(body[key]);
    if (value === undefined) {
      return NextResponse.json(
        { error: { code: "validation_error", message: `${key} must be an https image URL, or empty to clear it.` } },
        { status: 400 }
      );
    }
    patch[key] = value;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Nothing to update." } },
      { status: 400 }
    );
  }

  const settings = await updateSiteSettings(patch);
  return NextResponse.json(settings);
}
