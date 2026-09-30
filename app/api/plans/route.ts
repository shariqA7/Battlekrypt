// GET /api/plans?audience=organizer|club|player — plans people can buy
// (active ones), with price and limits.
import { NextResponse } from "next/server";
import { isAudience, listPlans } from "@/lib/services/plan-requests";

export async function GET(request: Request) {
  const audience = new URL(request.url).searchParams.get("audience");
  if (audience !== null && !isAudience(audience)) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Unknown audience." } },
      { status: 400 }
    );
  }
  const plans = await listPlans({ audience: audience ?? undefined, activeOnly: true });
  return NextResponse.json(plans);
}
