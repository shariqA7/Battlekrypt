// PATCH /api/admin/ad-settings — { adsenseClientId?, adsenseSlotBrowse?, adsenseSlotTournament?, adsenseSlotDashboard? }
// An empty string clears a field. No publisher ID = Google AdSense is off.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { updateAdsenseSettings } from "@/lib/services/ads";

export async function PATCH(request: Request) {
  const auth = await requireAdmin("ads");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const r = await updateAdsenseSettings(b);
  if (r.error) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: 400 });
  return NextResponse.json({ ok: true });
}
