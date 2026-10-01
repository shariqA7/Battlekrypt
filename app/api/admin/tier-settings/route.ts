// GET  /api/admin/tier-settings — list every (tier, scope) row
// POST /api/admin/tier-settings — create/update one (upsert on tier+scope+scopeValue)
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { listTierSettings, upsertTierSetting } from "@/lib/services/competitive-tiers";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  return NextResponse.json({ data: await listTierSettings() });
}

const VALID_TIERS = ["D", "C", "B", "A", "S", "National"];
const VALID_SCOPES = ["world", "region", "country"];
const VALID_PUBLISH_PATHS = ["instant", "admin_review", "always_admin"];

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));

  if (!VALID_TIERS.includes(body.tier)) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "tier must be one of D/C/B/A/S/National." } },
      { status: 400 }
    );
  }
  if (!VALID_SCOPES.includes(body.scope)) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "scope must be world/region/country." } },
      { status: 400 }
    );
  }
  if (!VALID_PUBLISH_PATHS.includes(body.publishPath)) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "publishPath must be instant/admin_review/always_admin.",
        },
      },
      { status: 400 }
    );
  }
  if (typeof body.minPrizePoolUsd !== "number" || body.minPrizePoolUsd < 0) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "minPrizePoolUsd must be a number ≥ 0." } },
      { status: 400 }
    );
  }

  const result = await upsertTierSetting({
    tier: body.tier,
    scope: body.scope,
    scopeValue: body.scopeValue ?? null,
    minPrizePoolUsd: body.minPrizePoolUsd,
    minRating: body.minRating ?? null,
    minWins: body.minWins ?? null,
    publishPath: body.publishPath,
  });

  if (result.error === "scope_value_required") {
    return NextResponse.json(
      {
        error: {
          code: "scope_value_required",
          message: "scopeValue (the country/region name) is required for a non-world scope.",
        },
      },
      { status: 400 }
    );
  }

  return NextResponse.json(result.data);
}
