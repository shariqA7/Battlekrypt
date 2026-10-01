// GET /api/organizer/tier-floor?tier=B — resolves which CompetitiveTierSetting
// applies to the calling organizer (their country > region > world) so the
// tournament form can show a live floor before they even enter a prize
// pool. Deliberately organizer-scoped rather than a generic settings read —
// resolution depends on who's asking.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { resolveTierSetting } from "@/lib/services/competitive-tiers";

const VALID_TIERS = ["D", "C", "B", "A", "S", "National"];

export async function GET(request: Request) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const tier = new URL(request.url).searchParams.get("tier");
  if (!tier || !VALID_TIERS.includes(tier)) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "tier must be one of D/C/B/A/S/National." } },
      { status: 400 }
    );
  }

  const setting = await resolveTierSetting(
    tier as "D" | "C" | "B" | "A" | "S" | "National",
    auth.organizerProfile.country,
    auth.organizerProfile.region
  );

  return NextResponse.json({ data: setting });
}
