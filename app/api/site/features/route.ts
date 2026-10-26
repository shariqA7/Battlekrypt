// GET /api/site/features — which features are switched on (booleans only), for
// client-side forms that need to show or hide a section. No login required.
import { NextResponse } from "next/server";
import { getFeatureFlags } from "@/lib/services/feature-flags";

export async function GET() {
  return NextResponse.json(await getFeatureFlags(), { headers: { "Cache-Control": "no-store" } });
}
