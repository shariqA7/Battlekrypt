// GET /api/admin/suggested-rules — every suggestion, including hidden ones
// POST /api/admin/suggested-rules — add a suggestion
// { title, description, action, penaltyPoints?, gameCategory?, isActive? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { ruleError } from "@/lib/rule-helpers";
import { listAllSuggestedRules, createSuggestedRule } from "@/lib/services/rules";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  return NextResponse.json({ data: await listAllSuggestedRules() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await createSuggestedRule(body ?? {});
  if ("error" in result) return ruleError(result);
  return NextResponse.json(result.data, { status: 201 });
}
